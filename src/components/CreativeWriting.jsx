import { useState, useEffect, useRef } from 'react';
import { generateStory, continueStory } from '../lib/StoryEngine';
import { saveSession, generateSessionId, autoDetectAndSetModel, getModelCtx } from '../lib/api';
import { GAME_MODES } from '../App';
import { version as appVersion } from '../../package.json';
import { useLanguage } from '../context/LanguageContext';
import useEntranceAnimation from '../hooks/useEntranceAnimation';
import downloadBlob from '../utils/downloadBlob';
import { OLLAMA_DEFAULT_URL } from '../lib/defaults';

/**
 * @param {object} props
 * @param {object|null} props.loadedSession - Restored session data
 * @param {Function} props.onBack - Navigate back
 * @param {object} props.settings - Parent settings (ollamaUrl, ollamaModel, etc.)
 */
function CreativeWriting({ loadedSession, onBack, settings: parentSettings }) {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState('');
  const [story, setStory] = useState('');
  const [genre, setGenre] = useState(null);
  const [authorNote, setAuthorNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [summary, setSummary] = useState(null);
  const [wordCount, setWordCount] = useState(0);
  const [error, setError] = useState(null);
  const [currentModel, setCurrentModel] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showAuthorNote, setShowAuthorNote] = useState(false);
  const [promptCollapsed, setPromptCollapsed] = useState(false);

  const streamBufferRef = useRef('');
  const rafRef = useRef(null);
  const contentRef = useRef(null);
  const importFileRef = useRef(null);
  const promptRef = useRef(null);
  const mountedRef = useRef(true);
  const activeRequestIdRef = useRef(null);

  const isVisible = useEntranceAnimation(50);

  const GENRE_KEYS = ['romantic', 'hardcore', 'dark', 'fantasy', 'funny'];
  const GENRE_TRANSLATION_MAP = {
    romantic: t.creative.genreRomantic,
    hardcore: t.creative.genreHardcore,
    dark: t.creative.genreDark,
    fantasy: t.creative.genreFantasy,
    funny: t.creative.genreFunny
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (activeRequestIdRef.current) {
        window.electronAPI?.ollamaStreamAbort(activeRequestIdRef.current);
        activeRequestIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (loadedSession) {
        setSessionId(loadedSession.sessionId);
        setStory(loadedSession.content || '');
        setPrompt(loadedSession.lastPrompt || '');
        setGenre(loadedSession.genre || null);
        setAuthorNote(loadedSession.authorNote || '');
        setSummary(loadedSession.summary || null);
        if (loadedSession.content) setPromptCollapsed(true);
      } else {
        setSessionId(generateSessionId());
      }

      const autoDetectResult = await autoDetectAndSetModel();
      if (autoDetectResult.success) {
        setCurrentModel(autoDetectResult.model);
      }
    };
    init();
  }, [loadedSession]);

  useEffect(() => {
    const words = story.trim() ? story.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, [story]);

  useEffect(() => {
    if (!sessionId || !currentModel || !story) return;

    const sessionData = {
      characterId: 'creative_writing',
      characterName: 'Creative Writing',
      mode: GAME_MODES?.CREATIVE_WRITING || 'creative_writing',
      content: story,
      genre,
      lastPrompt: prompt,
      authorNote,
      summary,
      model: currentModel
    };

    saveSession(sessionId, sessionData).catch(() => {});
  }, [story, sessionId, currentModel, genre, prompt, authorNote, summary]);

  const examplePrompts = t.creative.prompts ? [
    t.creative.prompts.prompt1,
    t.creative.prompts.prompt2,
    t.creative.prompts.prompt3,
    t.creative.prompts.prompt4,
  ] : [];

  const handleStop = () => {
    if (activeRequestIdRef.current) {
      window.electronAPI?.ollamaStreamAbort(activeRequestIdRef.current);
      activeRequestIdRef.current = null;
    }
  };

  const handleGenerate = async () => {
    const model = parentSettings?.ollamaModel || currentModel;
    if (!prompt.trim() || isLoading || isStreaming || !model) return;
    setIsLoading(true);
    setError(null);

    const requestId = `story-${Date.now()}`;
    activeRequestIdRef.current = requestId;

    let firstToken = true;
    streamBufferRef.current = '';
    rafRef.current = null;

    const flushBuffer = () => {
      if (!mountedRef.current) return;
      setStreamingContent(streamBufferRef.current);
      rafRef.current = null;
    };

    const handleToken = (token) => {
      if (typeof token !== 'string') return;
      streamBufferRef.current += token;
      if (firstToken) {
        firstToken = false;
        setIsLoading(false);
        setIsStreaming(true);
        setStreamingContent(streamBufferRef.current);
        return;
      }
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushBuffer);
      }
    };

    try {
      const language = localStorage.getItem('language') || 'en';
      const ollamaUrl = parentSettings?.ollamaUrl || OLLAMA_DEFAULT_URL;
      const numCtx = await getModelCtx(ollamaUrl, model, parentSettings?.contextSize || 'medium');

      const result = await generateStory({
        prompt: prompt.trim(),
        genre,
        authorNote: authorNote.trim() || null,
        options: { ollamaUrl, model, language, onToken: handleToken, requestId, numCtx }
      });

      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      if (result.success) {
        const finalContent = result.content || streamBufferRef.current;
        setStory(prev => prev ? prev + '\n\n' + finalContent : finalContent);
        setPromptCollapsed(true);
        setTimeout(() => {
          contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
        }, 100);
      } else {
        setError(result.error);
      }
    } catch (err) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setError(err.message);
    } finally {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      activeRequestIdRef.current = null;
      setIsStreaming(false);
      setStreamingContent('');
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    const model = parentSettings?.ollamaModel || currentModel;
    if (!story || isLoading || isStreaming || !model) return;
    setIsLoading(true);
    setError(null);

    const requestId = `story-${Date.now()}`;
    activeRequestIdRef.current = requestId;

    let firstToken = true;
    streamBufferRef.current = '';
    rafRef.current = null;

    const flushBuffer = () => {
      if (!mountedRef.current) return;
      setStreamingContent(streamBufferRef.current);
      rafRef.current = null;
    };

    const handleToken = (token) => {
      if (typeof token !== 'string') return;
      streamBufferRef.current += token;
      if (firstToken) {
        firstToken = false;
        setIsLoading(false);
        setIsStreaming(true);
        setStreamingContent(streamBufferRef.current);
        return;
      }
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushBuffer);
      }
    };

    try {
      const language = localStorage.getItem('language') || 'en';
      const ollamaUrl = parentSettings?.ollamaUrl || OLLAMA_DEFAULT_URL;
      const numCtx = await getModelCtx(ollamaUrl, model, parentSettings?.contextSize || 'medium');

      const result = await continueStory({
        storyText: story,
        genre,
        authorNote: authorNote.trim() || null,
        summary,
        options: { ollamaUrl, model, language, onToken: handleToken, requestId, numCtx }
      });

      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      if (result.success) {
        const finalContent = result.content || streamBufferRef.current;
        setStory(prev => prev + '\n\n' + finalContent);
        if (result.summary) setSummary(result.summary);
      } else {
        setError(result.error);
      }
    } catch (err) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setError(err.message);
    } finally {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      activeRequestIdRef.current = null;
      setIsStreaming(false);
      setStreamingContent('');
      setIsLoading(false);

      setTimeout(() => {
        contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  };

  const handleNewStory = () => {
    if (story && !window.confirm(t.creative.areYouSureClear)) return;
    setStory('');
    setPrompt('');
    setGenre(null);
    setAuthorNote('');
    setSummary(null);
    setError(null);
    setPromptCollapsed(false);
    setShowAuthorNote(false);
    setSessionId(generateSessionId());
  };

  const handleExport = () => {
    try {
      const exportData = {
        prompt,
        genre,
        story,
        wordCount,
        authorNotes: authorNote ? [authorNote] : [],
        exportedAt: new Date().toISOString(),
        version: appVersion
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `story-${Date.now()}.json`);
    } catch {
      setError(t.creative.failedToExportStory);
    }
  };

  const handleImportClick = () => importFileRef.current?.click();

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.story && !data.content) {
        alert(t.creative.invalidStoryFile);
        return;
      }
      setStory(data.story || data.content || '');
      if (data.prompt) setPrompt(data.prompt);
      if (data.genre) setGenre(data.genre);
      if (data.authorNotes?.[0]) setAuthorNote(data.authorNotes[0]);
      if (data.summary) setSummary(data.summary);
      setPromptCollapsed(true);
    } catch {
      alert(t.creative.failedToImportStory);
    } finally {
      e.target.value = '';
    }
  };

  /**
   * Format story text with dialogue highlighting and narration styling.
   * @param {string} text - Raw story text
   * @param {boolean} showCursor - Whether to show streaming cursor
   */
  function formatStoryText(text, showCursor = false) {
    if (!text || typeof text !== 'string') return null;

    const paragraphs = text.split('\n').filter(p => p.trim());

    return paragraphs.map((paragraph, pIndex) => {
      const quotePattern = /(".*?"|".*?")/g;
      const parts = paragraph.split(quotePattern);
      const isLast = pIndex === paragraphs.length - 1;

      const formattedParts = parts.map((part, partIndex) => {
        if (!part || part.trim() === '') return null;
        const cleanedPart = part.replace(/\*/g, '');
        const isDialog = (/^".*"$/.test(part)) || (/^\u201c.*\u201d$/.test(part));

        if (isDialog) {
          return (
            <span key={partIndex} className="text-rose-400/80 font-medium">
              {cleanedPart}
            </span>
          );
        }
        return (
          <span key={partIndex} className="text-zinc-300 italic">
            {cleanedPart}
          </span>
        );
      });

      return (
        <p key={pIndex} className="mb-4 last:mb-0">
          {formattedParts}
          {showCursor && isLast && (
            <span className="inline-block w-2 h-4 bg-rose-500 animate-pulse ml-0.5 align-middle" />
          )}
        </p>
      );
    });
  }

  const hasStory = !!story;

  return (
    <div className={`h-full w-full flex flex-col bg-zinc-950 transition-all duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    }`}>
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />

      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 border-b border-zinc-800/50">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-white">{t.creative.creativeWriting}</h2>
        </div>

        <div className="flex items-center gap-2">
          {hasStory && (
            <button
              onClick={handleNewStory}
              className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            >
              {t.creative.newStory}
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={!hasStory}
            className="p-2 hover:bg-white/5 rounded-xl transition-all duration-200 disabled:opacity-30 text-zinc-500 hover:text-white"
            title={t.creative.export}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </button>
          <button
            onClick={handleImportClick}
            className="p-2 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
            title={t.creative.import}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="max-w-3xl mx-auto px-6 py-6">

          <div className="flex flex-wrap gap-2 mb-4">
            {GENRE_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setGenre(genre === key ? null : key)}
                className={`px-4 py-1.5 rounded-full text-sm transition-all border-2 ${
                  genre === key
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                    : 'border-transparent bg-zinc-800/50 text-zinc-400 hover:border-rose-500 hover:text-zinc-200'
                }`}
              >
                {GENRE_TRANSLATION_MAP[key]}
              </button>
            ))}
            <button
              onClick={() => setGenre(null)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all border-2 ${
                genre === null
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                  : 'border-transparent bg-zinc-800/50 text-zinc-400 hover:border-rose-500 hover:text-zinc-200'
              }`}
            >
              {t.creative.genreNone}
            </button>
          </div>

          {promptCollapsed ? (
            <button
              onClick={() => setPromptCollapsed(false)}
              className="w-full mb-4 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 text-left text-zinc-500 text-sm hover:border-zinc-700 transition-all truncate"
            >
              <span className="text-zinc-600 mr-2">▶</span>
              {prompt || t.creative.enterStoryPrompt}
            </button>
          ) : (
            <div className="mb-4">
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isLoading && !isStreaming) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder={t.creative.enterStoryPrompt}
                disabled={isLoading || isStreaming}
                rows={4}
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 disabled:opacity-50 resize-none text-sm"
              />
              <div className="flex items-center justify-between mt-2">
                {isStreaming ? (
                  <button
                    onClick={handleStop}
                    className="px-6 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isLoading}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-br from-rose-600 to-pink-700 hover:from-rose-500 hover:to-pink-600 text-white font-medium transition-all disabled:opacity-30 flex items-center gap-2 shadow-lg shadow-rose-900/30"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{t.creative.generating}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>{t.creative.generate}</span>
                      </>
                    )}
                  </button>
                )}
                {promptCollapsed === false && hasStory && (
                  <button
                    onClick={() => setPromptCollapsed(true)}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    ▲
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-900/20 border border-red-700/30 text-red-300 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!hasStory && !isStreaming && !isLoading && (
            <div className="mt-8">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">{t.creative.tryThesePrompts}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {examplePrompts.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setPrompt(example); promptRef.current?.focus(); }}
                    className="text-left p-4 rounded-xl bg-zinc-900/30 border-2 border-transparent hover:border-rose-500 text-zinc-400 hover:text-zinc-200 text-sm transition-all"
                  >
                    &ldquo;{example}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {(hasStory || isStreaming) && (
            <div className="font-sans text-base leading-loose mt-2">
              {isStreaming ? (
                <>
                  {story && formatStoryText(story)}
                  {story && streamingContent && <div className="mt-4" />}
                  {formatStoryText(streamingContent, true)}
                </>
              ) : (
                formatStoryText(story)
              )}
            </div>
          )}
        </div>
      </div>

      {hasStory && (
        <div className="flex-shrink-0 border-t border-zinc-800/50 px-6 py-3">
          {showAuthorNote && (
            <div className="mb-3 bg-zinc-900/50 border border-zinc-800 rounded-xl p-3">
              <textarea
                value={authorNote}
                onChange={(e) => setAuthorNote(e.target.value)}
                placeholder={t.creative.authorNotePlaceholder}
                rows={2}
                className="w-full bg-transparent text-zinc-300 placeholder-zinc-600 text-sm focus:outline-none resize-none"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAuthorNote(!showAuthorNote)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all border-2 ${
                  showAuthorNote
                    ? 'border-rose-500/50 text-rose-400 bg-rose-500/10'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-rose-500'
                }`}
              >
                {t.creative.authorNote}
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(story).catch(() => {}); }}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                title={t.creative.copyToClipboard}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              </button>
              <span className="text-xs text-zinc-600">
                {t.creative.wordsCount.replace('{count}', wordCount.toLocaleString())}
              </span>
            </div>
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="px-5 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-all flex items-center gap-2 text-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleContinue}
                disabled={isLoading}
                className="px-5 py-2 rounded-xl bg-gradient-to-br from-rose-600 to-pink-700 hover:from-rose-500 hover:to-pink-600 text-white font-medium transition-all disabled:opacity-30 flex items-center gap-2 text-sm shadow-lg shadow-rose-900/30"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t.creative.generating}</span>
                  </>
                ) : (
                  <span>{t.creative.continueStory}</span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CreativeWriting;
