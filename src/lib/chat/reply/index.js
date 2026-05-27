import { passionManager, getSpeedMultiplier } from '../passion/index.js';
import { resolveProfile } from '../../modelProfiles.js';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from '../../defaults.js';
import { getEffectiveResponseMode, getResponseModeTokenLimit } from '../../responseModes.js';
import { assembleRuntimeContext, buildRuntimeState, estimateTokens as estimateRuntimeTokens } from '../../chatRuntime/index.js';
import { cleanTranscriptArtifacts, shouldAutoStopStreamingResponse } from '../common.js';
import { checkPhraseRepetition, checkGestureRepetition, getRecentAssistantReplies } from '../repetitionGuard.js';
import { deriveAssistBudgetTier, getModelCtx, getModelCapabilities } from '../../ollama/index.js';
import { loadSettings } from '../../storage/settings.js';
import { isElectron } from '../platform.js';

function estimatePassionHeuristic(userMessage = '', aiMessage = '', currentPassionLevel = 0) {
  const combined = `${userMessage}\n${aiMessage}`.toLowerCase();
  let score = 0;

  const weightedSignals = [
    { pattern: /\bkiss(?:ed|es|ing)?\b|\blips?\b|\bmouth\b/g, value: 2 },
    { pattern: /\bhand\b|\bwaist\b|\bneck\b|\blap\b|\bthigh\b|\bbreast\b|\bchest\b/g, value: 1.5 },
    { pattern: /\btouch(?:ing)?\b|\bcaress\b|\bstroke\b|\bunder the hem\b|\bunder your dress\b|\bmore intimately\b/g, value: 2 },
    { pattern: /\bblush(?:ing)?\b|\bflutter(?:ing)?\b|\bshiver(?:ing)?\b|\btrembl(?:e|ing)\b|\bbreath(?:less|ing)?\b/g, value: 1 },
    { pattern: /\bdesire\b|\barous(?:ed|ing)\b|\bheat\b|\bache\b|\bneed(?:y)?\b/g, value: 1.5 },
    { pattern: /\bbetween (?:my|your|her|his) legs\b|\buntouched body\b|\bintimate pleasures\b/g, value: 2.5 }
  ];

  for (const { pattern, value } of weightedSignals) {
    const matches = combined.match(pattern);
    if (matches) {
      score += matches.length * value;
    }
  }

  if (/["“”]/.test(aiMessage) && /\*(.*?)\*/.test(aiMessage)) {
    score += 0.5;
  }

  if (currentPassionLevel >= 15 && /\bkiss|touch|waist|neck|lap|intimate\b/.test(combined)) {
    score += 1;
  }

  return Math.max(0, Math.min(10, Math.round(score)));
}

function applyPassionHeuristic(userMessage, aiMessage, sessionId, character, currentPassionLevel = 0) {
  const heuristicScore = estimatePassionHeuristic(userMessage, aiMessage, currentPassionLevel);
  if (heuristicScore <= 0) return currentPassionLevel;
  const adjustedScore = heuristicScore * getSpeedMultiplier(character?.passionSpeed);
  const nextLevel = passionManager.applyScore(sessionId, adjustedScore);
  console.log(`[API] Passion heuristic: ${currentPassionLevel} → ${nextLevel} (raw=${heuristicScore}, adj=${adjustedScore.toFixed(1)})`);
  return nextLevel;
}

export function buildSystemPrompt({ character, userName = 'User', passionLevel = 0, unchainedMode = false, responseMode = 'normal' }) {
  const runtimeState = buildRuntimeState({
    character,
    history: [],
    userName,
    runtimeSteering: {
      profile: 'reply',
      availableContextTokens: 2048,
      responseMode,
      passionLevel,
      unchainedMode,
      assistBudgetTier: 'default'
    }
  });

  return assembleRuntimeContext({ profile: 'reply', runtimeState }).systemPrompt;
}

export const sendMessage = async (
  userMessage,
  character,
  conversationHistory = [],
  sessionId = null,
  unchainedMode = false,
  onApiStats = null,
  settingsOverride = null,
  onToken = null,  // Streaming callback — receives each token chunk as string
  streamAbortHandle = null,
  sceneMemory = null,
  lastTurnBannedPhrases = []
) => {
  const startTime = Date.now();
  if (!character || !character.name) {
    console.error('[v9.2 API] ❌ Invalid character data');
    return {
      success: false,
      error: 'Character data is missing or invalid'
    };
  }

  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    console.error('[v9.2 API] ❌ Empty or invalid message');
    return {
      success: false,
      error: 'Message cannot be empty'
    };
  }

  const MAX_INPUT_LENGTH = 4096;
  if (userMessage.length > MAX_INPUT_LENGTH) {
    console.warn(`[API] Input truncated: ${userMessage.length} → ${MAX_INPUT_LENGTH} chars`);
    userMessage = userMessage.slice(0, MAX_INPUT_LENGTH);
  }

  let streamTerminationReason = 'unknown';
  const wasUserAborted = () => streamAbortHandle?.aborted && streamAbortHandle.reason === 'user';

  try {
    const settings = { ...(settingsOverride || await loadSettings()) };

    const ollamaUrl = settings.ollamaUrl || OLLAMA_DEFAULT_URL;
    const model = settings.ollamaModel || DEFAULT_MODEL_NAME;
    const modelCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 4096);
    const modelCapabilities = await getModelCapabilities(ollamaUrl, model);
    const profile = resolveProfile(model, settings.customProfiles);
    const historyToUse = (Array.isArray(conversationHistory) ? conversationHistory : []).filter(m => m.role !== 'system');

    console.log(`[API] Model: ${model} (${profile.family}), ctx: ${modelCtx}`);

    const currentPassionLevel = passionManager.getPassionLevel(sessionId || '');

    const userName = settings.userName || 'User';
    const userGender = settings.userGender || 'male';
    const userPronouns = settings.userPronouns || 'he/him';

    const responseMode = getEffectiveResponseMode(character, userMessage);
    const baseNumPredict = settings.maxResponseTokens ?? profile.maxResponseTokens ?? 512;
    const numPredict = getResponseModeTokenLimit(baseNumPredict, responseMode);
    const assistBudgetTier = deriveAssistBudgetTier({
      parameterSize: modelCapabilities.parameterSize,
      modelName: model,
      contextSize: settings.contextSize || 4096,
      maxResponseTokens: baseNumPredict
    });
    const runtimeState = buildRuntimeState({
      character,
      history: historyToUse,
      userName,
      userGender,
      userPronouns,
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: Math.max(320, modelCtx - numPredict - 128),
        responseMode,
        passionLevel: currentPassionLevel,
        unchainedMode,
        assistBudgetTier,
        persistedSceneMemory: sceneMemory,
        lastTurnBannedPhrases: Array.isArray(lastTurnBannedPhrases) ? lastTurnBannedPhrases : []
      }
    });
    const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
    const finalSystemPrompt = runtimeContext.systemPrompt;
    const trimmedHistory = runtimeContext.historyMessages;
    const promptTokens = estimateRuntimeTokens(finalSystemPrompt) + trimmedHistory.reduce((sum, message) => sum + estimateRuntimeTokens(message.content), 0);
    let retryTriggered = false;

    console.log(`[API] Unchained: ${unchainedMode}, Passion: ${currentPassionLevel}, ResponseMode: ${responseMode}`);
    console.log('[API] Reply runtime:', runtimeContext.debug);
    console.log(`[API] Prompt ~${promptTokens}t, history: ${trimmedHistory.length}/${historyToUse.length} msgs, num_ctx: ${modelCtx}`);

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...trimmedHistory.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    const chatOptions = {
      temperature: profile.temperature,
      num_predict: numPredict,
      num_ctx: modelCtx,
      top_k: profile.topK,
      top_p: profile.topP,
      min_p: profile.minP,
      repeat_penalty: profile.repeatPenalty,
      repeat_last_n: profile.repeatLastN,
      penalize_newline: profile.penalizeNewline
    };
    if (profile.flags?.dry) {
      chatOptions.dry_multiplier = profile.flags.dryMultiplier ?? 0.8;
      chatOptions.dry_base = profile.flags.dryBase ?? 1.75;
      chatOptions.dry_allowed_length = profile.flags.dryAllowedLength ?? 2;
      chatOptions.dry_penalty_last_n = profile.flags.dryPenaltyLastN ?? 512;
    }
    const stopSequences = [`\n${userName}:`, '<|endoftext|>', '<|im_start|>', '<|im_end|>', '<|eot_id|>', '<|start_header_id|>'];

    let data;

    const normalizeReason = (reason) => {
      if (reason === 'user') return 'user';
      if (reason === 'auto-length') return 'done';
      if (reason === 'timeout') return 'disconnect';
      if (reason === 'stop' || reason === 'length' || reason === 'done') return 'done';
      return reason || 'unknown';
    };

    const bindStreamAbort = (abortFn) => {
      if (streamAbortHandle && typeof streamAbortHandle.setAbortImpl === 'function') {
        streamAbortHandle.setAbortImpl(abortFn);
      }
    };

    if (isElectron() && onToken) {
      const requestId = `chat-${Date.now()}`;
      let abortIssued = false;
      let streamedContent = '';
      const abortStream = (reason = 'user') => {
        if (abortIssued) return;
        abortIssued = true;
        streamTerminationReason = normalizeReason(reason);
        window.electronAPI.ollamaStreamAbort(requestId, reason).catch(() => {});
      };
      bindStreamAbort(abortStream);
      const cleanup = window.electronAPI.onOllamaStreamToken(({ requestId: rid, token }) => {
        if (rid !== requestId || typeof token !== 'string' || wasUserAborted()) return;
        streamedContent += token;
        onToken(token);
        if (!abortIssued && shouldAutoStopStreamingResponse(streamedContent, responseMode)) {
          abortStream('auto-length');
        }
      });
      const abortTimer = setTimeout(() => abortStream('timeout'), 120000);

      try {
        const result = await window.electronAPI.ollamaChatStream({
          requestId,
          ollamaUrl,
          model,
          messages,
          options: chatOptions,
          stop: stopSequences
        });

        if (wasUserAborted()) {
          streamTerminationReason = 'user';
          return { success: false, error: 'The operation was aborted', aborted: true, reason: 'user' };
        }

        if (!result.success) {
          if (result.aborted) {
            const abortReason = result.abortedBy || streamTerminationReason;
            if (abortReason === 'user') {
              streamTerminationReason = 'user';
              return { success: false, error: 'The operation was aborted', aborted: true, reason: 'user' };
            }
            if (abortReason === 'timeout') {
              streamTerminationReason = 'disconnect';
              throw new Error('The operation was aborted');
            }
          }
          streamTerminationReason = 'disconnect';
          throw new Error(result.error || 'Stream failed');
        }

        data = {
          message: { content: result.content || streamedContent },
          eval_count: result.evalCount,
          prompt_eval_count: result.promptEvalCount
        };
        if (result.abortedBy) {
          streamTerminationReason = normalizeReason(result.abortedBy);
        } else {
          streamTerminationReason = 'done';
        }
      } finally {
        clearTimeout(abortTimer);
        bindStreamAbort(null);
        cleanup();
      }
    } else if (isElectron()) {
      const result = await window.electronAPI.aiChat({
        messages: messages.slice(1).map(m => ({ role: m.role, content: m.content })),
        systemPrompt: finalSystemPrompt,
        model,
        isOllama: true,
        ollamaUrl,
        temperature: chatOptions.temperature,
        maxTokens: numPredict,
        num_ctx: modelCtx
      });

      if (!result.success) throw new Error(result.error || 'Chat failed');

      data = {
        message: { content: result.content },
        eval_count: result.usage?.total_tokens || 0,
        prompt_eval_count: 0
      };
      streamTerminationReason = 'done';
    } else {
      const fetchController = new AbortController();
      const fetchTimer = setTimeout(() => fetchController.abort(), 120000);

      let response;
      try {
        response = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: fetchController.signal,
          body: JSON.stringify({
            model, messages, stream: !!onToken,
            options: chatOptions,
            stop: stopSequences
          })
        });
      } finally {
        clearTimeout(fetchTimer);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error: ${response.status} - ${errorText}`);
      }

      if (onToken && response.body) {
        const contentChunks = [];
        let finalChunk = null;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let abortIssued = false;
        const abortStream = (reason = 'user') => {
          if (abortIssued) return;
          abortIssued = true;
          streamTerminationReason = normalizeReason(reason);
          fetchController.abort();
        };
        bindStreamAbort(abortStream);

        try {
          while (true) {
            let readResult;
            try {
              readResult = await reader.read();
            } catch (readErr) {
              if (wasUserAborted()) {
                streamTerminationReason = 'user';
                break;
              }
              if (streamTerminationReason === 'done') {
                break;
              }
              console.warn('[API] Chat stream interrupted:', readErr.message);
              streamTerminationReason = 'disconnect';
              break;
            }
            const { done, value } = readResult;
            if (done) {
              if (!wasUserAborted() && streamTerminationReason !== 'done') {
                streamTerminationReason = 'truncated';
              }
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const chunk = JSON.parse(line);
                if (chunk.message?.content) {
                  if (wasUserAborted()) continue;
                  contentChunks.push(chunk.message.content);
                  onToken(chunk.message.content);
                  if (!abortIssued && shouldAutoStopStreamingResponse(contentChunks.join(''), responseMode)) {
                    abortStream('auto-length');
                  }
                }
                if (chunk.done) {
                  finalChunk = chunk;
                  streamTerminationReason = 'done';
                }
              } catch { /* skip malformed lines */ }
            }
          }
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer);
              if (chunk.message?.content) {
                if (wasUserAborted()) {
                  buffer = '';
                } else {
                  contentChunks.push(chunk.message.content);
                  onToken(chunk.message.content);
                }
              }
              if (chunk.done) {
                finalChunk = chunk;
                streamTerminationReason = 'done';
              }
            } catch { /* skip */ }
          }
        } finally {
          bindStreamAbort(null);
          reader.cancel().catch(() => {});
        }
        if (streamTerminationReason === 'user' || (streamAbortHandle?.aborted && streamAbortHandle.reason === 'user')) {
          streamTerminationReason = 'user';
          return {
            success: false,
            error: 'The operation was aborted',
            aborted: true,
            reason: 'user'
          };
        }
        const fullContent = contentChunks.join('');
        if (streamTerminationReason !== 'done' && streamTerminationReason !== 'disconnect' && streamTerminationReason !== 'truncated') {
          streamTerminationReason = finalChunk ? 'done' : 'truncated';
        }
        data = { message: { content: fullContent }, eval_count: finalChunk?.eval_count, prompt_eval_count: finalChunk?.prompt_eval_count };
      } else {
        try {
          data = await response.json();
          streamTerminationReason = 'done';
        } catch (parseErr) {
          console.error('[API] Failed to parse non-streaming response:', parseErr.message);
          throw new Error('Invalid response from Ollama (JSON parse failed)');
        }
      }
	    }

    if (wasUserAborted()) {
      streamTerminationReason = 'user';
      return {
        success: false,
        error: 'The operation was aborted',
        aborted: true,
        reason: 'user'
      };
    }

    if (data.message?.content && typeof data.message.content === 'string') {
      const stripped = data.message.content.replace(/[*\s\n_~`]/g, '');
      if (stripped.length < 3) {
        console.warn('[API] Empty/broken response — scheduling retry');
        data.message.content = '';
      }
    }

    if (!data.message || !data.message.content) {
      retryTriggered = true;
      console.error(`[API] Empty response after all attempts (history: ${trimmedHistory.length} msgs)`);
      const retrySystemPrompt = finalSystemPrompt + '\nIMPORTANT: Respond directly as the character.';
      const retryMessages = [
        { role: 'system', content: retrySystemPrompt },
        ...trimmedHistory.slice(-2).map(m => ({ role: m.role, content: m.content }))
      ];

      if (isElectron()) {
        try {
          const retryResult = await Promise.race([
            window.electronAPI.aiChat({
              messages: retryMessages.slice(1).map(m => ({ role: m.role, content: m.content })),
              systemPrompt: retrySystemPrompt,
              model,
              isOllama: true,
              ollamaUrl,
              temperature: 0.5,
              maxTokens: numPredict,
              num_ctx: modelCtx
            }),
            new Promise((_, reject) => {
              const t = setTimeout(() => reject(new Error('timeout')), 120000);
              // Prevent timeout from keeping Node alive if main promise wins
              if (typeof t === 'object' && t.unref) t.unref();
            })
          ]);
          if (retryResult.success && retryResult.content) {
            if (retryResult.content.replace(/[*\s\n_~`]/g, '').length >= 3) {
              data = { message: { content: retryResult.content }, eval_count: retryResult.usage?.total_tokens || 0 };
            }
          }
        } catch (err) { console.warn('[API] Retry request failed:', err?.message); }
      } else {
        const retryCtrl = new AbortController();
        const retryTimer = setTimeout(() => retryCtrl.abort(), 120000);
        try {
          const retryRes = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: retryCtrl.signal,
            body: JSON.stringify({
              model, messages: retryMessages, stream: false,
              options: { ...chatOptions, temperature: 0.5, num_predict: numPredict, num_ctx: modelCtx },
              stop: stopSequences
            })
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (retryData.message?.content && retryData.message.content.replace(/[*\s\n_~`]/g, '').length >= 3) {
              data = retryData;
            }
          }
        } catch (err) { console.warn('[API] Retry request failed:', err?.message); }
        finally { clearTimeout(retryTimer); }
      }

      if (!data.message || !data.message.content) {
        throw new Error('No response from Ollama');
      }
    }

    let aiMessage = data.message.content.trim();

    aiMessage = cleanTranscriptArtifacts(aiMessage, character.name);

    const recentReplies = getRecentAssistantReplies(historyToUse, 5);
    const evaluateRepetition = (candidate) => {
      const phrase = checkPhraseRepetition(candidate, recentReplies, {
        charName: character.name,
        userName
      });
      if (phrase.banned) return phrase;
      const gesture = checkGestureRepetition(candidate, recentReplies);
      return gesture.banned ? { banned: true, source: 'gesture', phrase: gesture.gesture } : { banned: false };
    };
    const initialRepetition = evaluateRepetition(aiMessage);
    console.info(`[API] Repetition guard: history=${recentReplies.length}, banned=${initialRepetition.banned}${initialRepetition.banned ? `, source=${initialRepetition.source}` : ''}`);
    const bannedPhrase = (
      initialRepetition.banned
      && streamTerminationReason === 'done'
      && typeof initialRepetition.phrase === 'string'
      && initialRepetition.phrase.trim()
    ) ? initialRepetition.phrase.trim() : null;
    if (bannedPhrase) {
      console.warn(`[API] Repetition guard — ${initialRepetition.source}: "${bannedPhrase}", will hint next turn`);
    }

    const passionEnabled = character?.passionEnabled !== false && Boolean(sessionId);
    const nextPassionLevel = passionEnabled
      ? applyPassionHeuristic(userMessage, aiMessage, sessionId, character, currentPassionLevel)
      : currentPassionLevel;

    const assistantMsg = { role: 'assistant', content: aiMessage };
    const finalHistory = [...historyToUse, assistantMsg];

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    const wordCount = aiMessage ? aiMessage.split(/\s+/).filter(Boolean).length : 0;
    const wordsPerSecond = (wordCount / (responseTime / 1000)).toFixed(2);

    // Use Ollama's actual token counts when available, fallback to estimation
    const responseTokens = data.eval_count || Math.round(wordCount * 1.3);
    const promptTokens_actual = data.prompt_eval_count || promptTokens;
    const debugStats = {
      ...runtimeContext.debug,
      retryTriggered
    };

    console.log(`[API] Tokens — response: ${responseTokens}, prompt: ${promptTokens_actual}, total: ${responseTokens + promptTokens_actual}`);

    if (onApiStats && typeof onApiStats === 'function') {
      onApiStats({
        model: model,
        responseTime: responseTime,
        wordCount: wordCount,
        wordsPerSecond: parseFloat(wordsPerSecond),
        tokens: responseTokens,
        promptTokens: promptTokens_actual,
        passionLevel: nextPassionLevel,
        responseMode,
        debug: debugStats
      });
    }

    if (wasUserAborted()) {
      return {
        success: false,
        error: 'The operation was aborted',
        aborted: true,
        reason: 'user'
      };
    }

    if (streamTerminationReason === 'disconnect' || streamTerminationReason === 'truncated') {
      return {
        success: false,
        partial: true,
        reason: streamTerminationReason,
        content: aiMessage,
        bannedPhrase: null,
        conversationHistory: finalHistory,
        passionLevel: nextPassionLevel,
        modelCtx,
        stats: {
          responseTime,
          wordCount,
          wordsPerSecond: parseFloat(wordsPerSecond),
          tokens: responseTokens,
          promptTokens: promptTokens_actual,
          model,
          responseMode,
          terminatedBy: streamTerminationReason,
          debug: debugStats
        }
      };
    }

    return {
      success: true,
      message: aiMessage,
      bannedPhrase,
      conversationHistory: finalHistory,
      passionLevel: nextPassionLevel,
      modelCtx,
      stats: {
        responseTime,
        wordCount,
        wordsPerSecond: parseFloat(wordsPerSecond),
        tokens: responseTokens,
        promptTokens: promptTokens_actual,
        model,
        responseMode,
        terminatedBy: streamTerminationReason,
        debug: debugStats
      }
    };

  } catch (error) {
    if (wasUserAborted()) {
      streamTerminationReason = 'user';
      return {
        success: false,
        error: error?.message || 'The operation was aborted',
        aborted: true,
        reason: 'user'
      };
    }
    if (streamTerminationReason === 'disconnect' || streamTerminationReason === 'truncated') {
      return {
        success: false,
        partial: true,
        reason: streamTerminationReason,
        error: error?.message || 'Stream interrupted'
      };
    }
    if (error?.message === 'The operation was aborted') {
      return {
        success: false,
        error: 'The operation was aborted',
        aborted: true,
        reason: 'user'
      };
    }
    console.error('[v8.1 API] ❌ Fatal error:', error);
    return {
      success: false,
      error: error.message || 'Connection to Ollama failed'
    };
  }
};
