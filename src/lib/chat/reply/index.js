import { passionManager, getSpeedMultiplier } from '../passion/index.js';
import { getModelProfile } from '../../modelProfiles.js';
import { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME } from '../../defaults.js';
import { getEffectiveResponseMode, getResponseModeTokenLimit } from '../../responseModes.js';
import { assembleRuntimeContext, buildRuntimeState, estimateTokens as estimateRuntimeTokens } from '../../chatRuntime/index.js';
import { cleanTranscriptArtifacts, isUnderfilledShortReply, shouldAutoStopStreamingResponse } from '../common.js';
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

// ============================================================================
// HELPER: CHECK IF RUNNING IN ELECTRON
// ============================================================================

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



// CORE API - MESSAGE SENDING (OLLAMA ONLY)
// ============================================================================

export const sendMessage = async (
  userMessage,
  character,
  conversationHistory = [],
  sessionId = null,
  unchainedMode = false,
  onApiStats = null,  // v0.2.5: NEW - Callback for API Monitor stats
  settingsOverride = null,  // v0.2.5: FIX - Accept settings directly to avoid race conditions
  onToken = null,  // Streaming callback — receives each token chunk as string
  streamAbortHandle = null,
  sceneMemory = null
) => {
  const startTime = Date.now();  // v0.2.5: Track response time
  
  // Safety checks
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

  try {
    const settings = { ...(settingsOverride || await loadSettings()) };

    const ollamaUrl = settings.ollamaUrl || OLLAMA_DEFAULT_URL;
    const model = settings.ollamaModel || DEFAULT_MODEL_NAME;
    const modelCtx = await getModelCtx(ollamaUrl, model, settings.contextSize || 4096);
    const modelCapabilities = await getModelCapabilities(ollamaUrl, model);
    const profile = getModelProfile(model);
    const historyToUse = (Array.isArray(conversationHistory) ? conversationHistory : []).filter(m => m.role !== 'system');

    console.log(`[API] Model: ${model} (${profile.family}), ctx: ${modelCtx}`);

    const currentPassionLevel = passionManager.getPassionLevel(sessionId || '');

    const userName = settings.userName || 'User';

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
      runtimeSteering: {
        profile: 'reply',
        availableContextTokens: Math.max(320, modelCtx - numPredict - 128),
        responseMode,
        passionLevel: currentPassionLevel,
        unchainedMode,
        assistBudgetTier,
        persistedSceneMemory: sceneMemory
      }
    });
    const runtimeContext = assembleRuntimeContext({ profile: 'reply', runtimeState });
    const finalSystemPrompt = runtimeContext.systemPrompt;
    const trimmedHistory = runtimeContext.historyMessages;
    const promptTokens = estimateRuntimeTokens(finalSystemPrompt) + trimmedHistory.reduce((sum, message) => sum + estimateRuntimeTokens(message.content), 0);
    let retryTriggered = false;
    let repairApplied = false;

    console.log(`[API] Unchained: ${unchainedMode}, Passion: ${currentPassionLevel}, ResponseMode: ${responseMode}`);
    console.log('[API] Reply runtime:', runtimeContext.debug);
    console.log(`[API] Prompt ~${promptTokens}t, history: ${trimmedHistory.length}/${historyToUse.length} msgs, num_ctx: ${modelCtx}`);

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...trimmedHistory.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    const chatOptions = {
      temperature: settings.temperature ?? profile.temperature,
      num_predict: numPredict,
      num_ctx: modelCtx,
      top_k: settings.topK ?? profile.topK,
      top_p: settings.topP ?? profile.topP,
      min_p: settings.minP ?? profile.minP,
      repeat_penalty: settings.repeatPenalty ?? profile.repeatPenalty,
      repeat_last_n: settings.repeatLastN ?? profile.repeatLastN,
      penalize_newline: settings.penalizeNewline ?? profile.penalizeNewline
    };
    const stopSequences = ['\nUser:', '\nHuman:', `\n${userName}:`, `\n${character.name}:`, '\nAssistant:', '\nAI:', '<|endoftext|>', '<|im_start|>', '<|im_end|>', '<|eot_id|>', '<|start_header_id|>'];

    let data;
    let streamTerminationReason = 'natural';
    const wasUserAborted = () => streamAbortHandle?.aborted && streamAbortHandle.reason === 'user';

    const bindStreamAbort = (abortFn) => {
      if (streamAbortHandle && typeof streamAbortHandle.setAbortImpl === 'function') {
        streamAbortHandle.setAbortImpl(abortFn);
      }
    };

    if (isElectron() && onToken) {
      // STREAMING via IPC
      const requestId = `chat-${Date.now()}`;
      let abortIssued = false;
      let streamedContent = '';
      const abortStream = (reason = 'user') => {
        if (abortIssued) return;
        abortIssued = true;
        streamTerminationReason = reason;
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
          return { success: false, error: 'The operation was aborted', aborted: true };
        }

        if (!result.success) {
          if (result.aborted) {
            const abortReason = result.abortedBy || streamTerminationReason;
            if (abortReason === 'user') {
              return { success: false, error: 'The operation was aborted', aborted: true };
            }
            if (abortReason === 'timeout') {
              throw new Error('The operation was aborted');
            }
          }
          throw new Error(result.error || 'Stream failed');
        }

        data = {
          message: { content: result.content || streamedContent },
          eval_count: result.evalCount,
          prompt_eval_count: result.promptEvalCount
        };
        streamTerminationReason = result.abortedBy || result.doneReason || streamTerminationReason;
      } finally {
        clearTimeout(abortTimer);
        bindStreamAbort(null);
        cleanup();
      }
    } else if (isElectron()) {
      // NON-STREAMING via IPC
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
    } else {
      // DIRECT FETCH fallback (non-Electron)
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
          streamTerminationReason = reason;
          fetchController.abort();
        };
        bindStreamAbort(abortStream);

        try {
          while (true) {
            let readResult;
            try {
              readResult = await reader.read();
            } catch (readErr) {
              if (streamTerminationReason === 'auto-length' || streamTerminationReason === 'user') {
                break;
              }
              console.warn('[API] Chat stream interrupted:', readErr.message);
              break;
            }
            const { done, value } = readResult;
            if (done) break;
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
                if (chunk.done) finalChunk = chunk;
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
              if (chunk.done) finalChunk = chunk;
            } catch { /* skip */ }
          }
        } finally {
          bindStreamAbort(null);
          reader.cancel().catch(() => {});
        }
        if (streamTerminationReason === 'user' || (streamAbortHandle?.aborted && streamAbortHandle.reason === 'user')) {
          return {
            success: false,
            error: 'The operation was aborted',
            aborted: true
          };
        }
        const fullContent = contentChunks.join('');
        data = { message: { content: fullContent }, eval_count: finalChunk?.eval_count, prompt_eval_count: finalChunk?.prompt_eval_count };
      } else {
        try {
          data = await response.json();
        } catch (parseErr) {
          console.error('[API] Failed to parse non-streaming response:', parseErr.message);
          throw new Error('Invalid response from Ollama (JSON parse failed)');
        }
      }
	    }

    if (wasUserAborted()) {
      return {
        success: false,
        error: 'The operation was aborted',
        aborted: true
      };
    }

    // Check for empty response
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

    const requestRevision = async (revisionPrompt, revisionTemperature, revisionMaxTokens) => {
      if (isElectron()) {
        const revisionResult = await window.electronAPI.aiChat({
          messages: messages.slice(1).map((msg) => ({ role: msg.role, content: msg.content })),
          systemPrompt: revisionPrompt,
          model,
          isOllama: true,
          ollamaUrl,
          temperature: revisionTemperature,
          maxTokens: revisionMaxTokens,
          num_ctx: modelCtx
        });

        if (revisionResult.success && revisionResult.content) {
          return {
            message: { content: revisionResult.content },
            eval_count: revisionResult.usage?.total_tokens || 0,
            prompt_eval_count: 0
          };
        }

        return null;
      }

      const revisionResponse = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: revisionPrompt },
            ...messages.slice(1)
          ],
          stream: false,
          options: {
            ...chatOptions,
            temperature: revisionTemperature,
            num_predict: revisionMaxTokens,
            num_ctx: modelCtx
          },
          stop: stopSequences
        })
      });

      if (!revisionResponse.ok) {
        return null;
      }

      return revisionResponse.json();
    };

    let aiMessage = data.message.content.trim();

    // Clean response — remove any transcript artifacts
    aiMessage = cleanTranscriptArtifacts(aiMessage, character.name);

    if (isUnderfilledShortReply(aiMessage, userMessage, responseMode)) {
      const repairPrompt = `${finalSystemPrompt}\n\nRESPONSE REPAIR:\n- Your last reply was too minimal and mirrored the user's brevity.\n- Reply again as ${character.name} with a complete, natural response.\n- Give 2-4 sentences in one short paragraph.\n- Include at least one concrete reaction, observation, or action.\n- Do not mention these instructions.`;

      try {
        const repairedData = await requestRevision(repairPrompt, 0.45, Math.min(numPredict, 192));
        if (repairedData?.message?.content) {
          const repairedMessage = cleanTranscriptArtifacts(repairedData.message.content.trim(), character.name);
          if (!isUnderfilledShortReply(repairedMessage, userMessage, responseMode)) {
            aiMessage = repairedMessage;
            data.eval_count = repairedData.eval_count || data.eval_count;
            data.prompt_eval_count = repairedData.prompt_eval_count || data.prompt_eval_count;
            repairApplied = true;
          }
        }
      } catch (repairError) {
        console.warn('[API] Short-reply repair failed:', repairError?.message);
      }
    }

    // Add assistant response to history
    const passionEnabled = character?.passionEnabled !== false && Boolean(sessionId);
    const nextPassionLevel = passionEnabled
      ? applyPassionHeuristic(userMessage, aiMessage, sessionId, character, currentPassionLevel)
      : currentPassionLevel;

    const assistantMsg = { role: 'assistant', content: aiMessage };
    const finalHistory = [...historyToUse, assistantMsg];

    // v0.2.5: CALCULATE API STATS FOR MONITOR
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    const wordCount = aiMessage ? aiMessage.split(/\s+/).filter(Boolean).length : 0;
    const wordsPerSecond = (wordCount / (responseTime / 1000)).toFixed(2);

    // Use Ollama's actual token counts when available, fallback to estimation
    const responseTokens = data.eval_count || Math.round(wordCount * 1.3);
    const promptTokens_actual = data.prompt_eval_count || promptTokens;
    const debugStats = {
      ...runtimeContext.debug,
      retryTriggered,
      repairApplied
    };

    console.log(`[API] Tokens — response: ${responseTokens}, prompt: ${promptTokens_actual}, total: ${responseTokens + promptTokens_actual}`);

    // v0.2.5: Send stats to callback if provided
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

    return {
      success: true,
      message: aiMessage,
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
    if (error?.message === 'The operation was aborted') {
      return {
        success: false,
        error: 'The operation was aborted',
        aborted: true
      };
    }
    console.error('[v8.1 API] ❌ Fatal error:', error);
    return {
      success: false,
      error: error.message || 'Connection to Ollama failed'
    };
  }
};
