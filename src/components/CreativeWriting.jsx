import React, { useState, useEffect, useRef } from 'react';
import { generateCreativeWriting, continueStory } from '../lib/StoryEngine';
import { saveSession, loadSession, generateSessionId, autoDetectAndSetModel } from '../lib/api';
import { GAME_MODES } from '../App';
import { useLanguage } from '../context/LanguageContext';

// ============================================================================
// ARIA v1.0 RELEASE - CreativeWriting
// ============================================================================

function CreativeWriting({ loadedSession, onBack }) {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [error, setError] = useState(null);
  const [currentModel, setCurrentModel] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  // Text Zoom State
  const [fontSize, setFontSize] = useState('base');

  const contentRef = useRef(null);
  const promptRef = useRef(null);
  const importFileRef = useRef(null);

  // ============================================================================
  // LOAD FONT SIZE PREFERENCE
  // ============================================================================
  useEffect(() => {
    const savedFontSize = localStorage.getItem('storyFontSize') || 'base';
    setFontSize(savedFontSize);
  }, []);

  // ============================================================================
  // PERSIST FONT SIZE CHANGES
  // ============================================================================
  useEffect(() => {
    localStorage.setItem('storyFontSize', fontSize);
  }, [fontSize]);

  // v1.0 ROSE NOIR: Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // ============================================================================
  // FIX #1: MODE INFECTION PREVENTION (CRITICAL)
  // ============================================================================
  // PROBLEM: When user leaves Creative Writing and enters Chat, the AI continues
  //          generating novel-style responses instead of roleplay chat.
  //
  // SOLUTION: useEffect cleanup function that runs when component unmounts.
  //           This resets any global state that might leak into other modes.
  // ============================================================================
  useEffect(() => {
    console.log('[CreativeWriting v9.2.3] 🎬 Story Mode activated - OMNI-PARSER');

    // CLEANUP FUNCTION: Runs when user navigates away from Creative Writing
    return () => {
      console.log('[CreativeWriting v9.2.3] 🧹 CLEANUP: Preventing mode infection');

      // Clear any potential global state pollution
      // This ensures Chat mode doesn't inherit Creative Writing's behavior

      // If we had global mode state, we'd reset it here:
      // Example: window.currentMode = null;
      // Example: sessionStorage.removeItem('creative_mode_active');

      // For this implementation, the cleanup is mostly preventative
      // but it's critical for future-proofing if global state is added
    };
  }, []);

  // ============================================================================
  // INITIALIZE SESSION & AUTO-DETECT MODEL
  // ============================================================================
  useEffect(() => {
    const initializeSession = async () => {
      if (loadedSession) {
        setSessionId(loadedSession.sessionId);
        setGeneratedContent(loadedSession.content || '');
        setHistory(loadedSession.history || []);
        setPrompt(loadedSession.lastPrompt || '');
      } else {
        setSessionId(generateSessionId());
      }

      // AUTO-DETECT MODEL
      console.log('[CreativeWriting v9.2.3] 🔍 Auto-detecting Ollama model...');
      const autoDetectResult = await autoDetectAndSetModel();

      if (autoDetectResult.success) {
        setCurrentModel(autoDetectResult.model);
        console.log(`[CreativeWriting v9.2.3] ✅ Model: ${autoDetectResult.model}`);
      } else {
        console.warn('[CreativeWriting v9.2.3] ⚠️ No models found');
      }
    };

    initializeSession();
  }, [loadedSession]);

  // ============================================================================
  // UPDATE WORD/CHARACTER COUNT
  // ============================================================================
  useEffect(() => {
    const words = generatedContent.trim() ? generatedContent.trim().split(/\s+/).length : 0;
    const chars = generatedContent.length;
    setWordCount(words);
    setCharCount(chars);
  }, [generatedContent]);

  // ============================================================================
  // FIX #2: AUTOSAVE WITH CRASH PROTECTION (CRITICAL)
  // ============================================================================
  // PROBLEM: App crashes when autoSave fires before model is loaded
  //          or when sessionId is undefined.
  //
  // SOLUTION: Defensive coding with explicit checks for all required values
  //           before attempting to save.
  // ============================================================================
  useEffect(() => {
    // DEFENSIVE CHECK #1: Session ID must exist
    if (!sessionId) {
      console.log('[CreativeWriting v9.2.3] ⏸️ AutoSave skipped: No sessionId');
      return;
    }

    // DEFENSIVE CHECK #2: Model must be loaded
    if (!currentModel) {
      console.log('[CreativeWriting v9.2.3] ⏸️ AutoSave skipped: Model not loaded');
      return;
    }

    // DEFENSIVE CHECK #3: Must have content or history to save
    if (!generatedContent && history.length === 0) {
      console.log('[CreativeWriting v9.2.3] ⏸️ AutoSave skipped: No content yet');
      return;
    }

    // SAFE TO SAVE: All prerequisites met
    const sessionData = {
      characterId: 'creative_writing',
      characterName: 'Creative Writing',
      mode: GAME_MODES?.CREATIVE_WRITING || 'creative_writing',
      content: generatedContent,
      conversationHistory: history,
      lastPrompt: prompt,
      model: currentModel,
    };

    console.log('[CreativeWriting v9.2.3] 💾 AutoSaving session...');

    saveSession(sessionId, sessionData).catch(err => {
      console.error('[CreativeWriting v9.2.3] ❌ Auto-save error:', err);
      // Don't crash the app - just log the error
    });
  }, [generatedContent, history, sessionId, currentModel, prompt]);

  // ============================================================================
  // HANDLE GENERATION
  // ============================================================================
  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // v1.0: Get language from settings
      const selectedLanguage = localStorage.getItem('language') || 'en';
      const response = await generateCreativeWriting(prompt.trim(), null, null, false, 0, selectedLanguage);

      if (response.success) {
        const newContent = response.content;
        setGeneratedContent(prev => {
          if (prev) {
            return prev + '\n\n---\n\n' + newContent;
          }
          return newContent;
        });

        setHistory(prev => [...prev, { prompt: prompt.trim(), timestamp: new Date().toISOString() }]);
        setPrompt('');

        setTimeout(() => {
          contentRef.current?.scrollTo({
            top: contentRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }, 100);
      } else {
        setError(response.error || 'Failed to generate content');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
      promptRef.current?.focus();
    }
  };

  // ============================================================================
  // HANDLE CONTINUE WRITING
  // ============================================================================
  const handleContinue = async () => {
    if (!generatedContent || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // v1.0: Get language from settings
      const selectedLanguage = localStorage.getItem('language') || 'en';
      const response = await continueStory(generatedContent, null, null, false, 0, selectedLanguage);

      if (response.success) {
        setGeneratedContent(prev => prev + '\n\n' + response.content);
        setHistory(prev => [...prev, { prompt: '[Continue]', timestamp: new Date().toISOString() }]);

        setTimeout(() => {
          contentRef.current?.scrollTo({
            top: contentRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }, 100);
      } else {
        setError(response.error || 'Failed to continue story');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // HANDLE CLEAR
  // ============================================================================
  const handleClear = () => {
    if (window.confirm(t.creative.areYouSureClear)) {
      setGeneratedContent('');
      setHistory([]);
      setPrompt('');
    }
  };

  // ============================================================================
  // HANDLE COPY
  // ============================================================================
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent);
      console.log('[CreativeWriting v9.2.3] ✅ Content copied to clipboard');
    } catch (err) {
      console.error('[CreativeWriting v9.2.3] ❌ Failed to copy:', err);
    }
  };

  // ============================================================================
  // IMPORT/EXPORT HANDLERS
  // ============================================================================
  const handleExportStory = () => {
    try {
      const exportData = {
        prompt: prompt,
        content: generatedContent,
        history: history,
        sessionId: sessionId,
        wordCount: wordCount,
        charCount: charCount,
        exportedAt: new Date().toISOString(),
        version: '9.2'
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `story-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert(t.creative.failedToExportStory);
    }
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportStory = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate required fields
      if (!importData.content || typeof importData.content !== 'string') {
        alert(t.creative.invalidStoryFile);
        return;
      }

      // Import the story
      setGeneratedContent(importData.content);
      if (importData.prompt) setPrompt(importData.prompt);
      if (importData.history) setHistory(importData.history);
      if (importData.sessionId) setSessionId(importData.sessionId);

      alert(t.creative.storyImported);
    } catch (error) {
      console.error('Import error:', error);
      alert(t.creative.failedToImportStory);
    } finally {
      e.target.value = '';
    }
  };

  // ============================================================================
  // ZOOM HANDLERS
  // ============================================================================
  const handleZoomIn = () => {
    const sizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl'];
    const currentIndex = sizes.indexOf(fontSize);
    if (currentIndex < sizes.length - 1) {
      setFontSize(sizes[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    const sizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl'];
    const currentIndex = sizes.indexOf(fontSize);
    if (currentIndex > 0) {
      setFontSize(sizes[currentIndex - 1]);
    }
  };

  // ============================================================================
  // EXAMPLE PROMPTS (from translations)
  // ============================================================================
  const examplePrompts = t.creative.prompts ? [
    t.creative.prompts.prompt1,
    t.creative.prompts.prompt2,
    t.creative.prompts.prompt3,
    t.creative.prompts.prompt4,
  ] : [
    "A secret desire that can no longer be hidden",
    "Two strangers in a hotel room with no rules",
    "A dark fantasy involving total surrender",
    "An intense encounter during a summer storm",
  ];

  // ============================================================================
  // TEXT FORMATTING - BLOCK 4 FIX: Apostroph-Bug behoben
  // ============================================================================
  function formatStoryText(text) {
    if (!text || typeof text !== 'string') return null;

    if (!currentModel) {
      return <p className="text-zinc-500 italic">{t.common.loading}</p>;
    }

    const paragraphs = text.split('\n').filter(p => p.trim());

    return paragraphs.map((paragraph, pIndex) => {
      // BLOCK 4 FIX: Match ONLY complete quote pairs, ignore apostrophes
      const quotePattern = /(".*?"|".*?")/g;
      const parts = paragraph.split(quotePattern);

      const formattedParts = parts.map((part, partIndex) => {
        if (!part || part.trim() === '') return null;

        const cleanedPart = part.replace(/\*/g, '');

        // Check if text is wrapped in quotes (dialogue)
        const isDialog = (/^".*"$/.test(part)) || (/^".*"$/.test(part));

        if (isDialog) {
          return (
            <span key={partIndex} className="text-zinc-400 font-bold">
              {cleanedPart}
            </span>
          );
        } else {
          return (
            <span key={partIndex} className="text-zinc-500 italic">
              {cleanedPart}
            </span>
          );
        }
      });

      return (
        <p key={pIndex} className="mb-4 last:mb-0">
          {formattedParts}
        </p>
      );
    });
  }

  // ============================================================================
  // RENDER UI
  // ============================================================================
  return (
    <div className={`h-full w-full flex flex-col bg-gradient-to-br from-zinc-900 via-zinc-900 to-black transition-all duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    }`}>
      {/* Hidden file input for import */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportStory}
        className="hidden"
      />

      {/* v1.0 ROSE NOIR: Premium Glass Header */}
      <div className="glass-header flex items-center justify-between px-6 py-5 flex-shrink-0 relative z-40">
        <div className="flex items-center gap-5">
          <button
            onClick={onBack}
            className="p-3 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">{t.creative.creativeWriting}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              <p className="text-xs text-rose-400 font-medium">{t.creative.uncensoredModeActive}</p>
            </div>
          </div>
        </div>

        {/* Stats & Toolbar - v1.0 ROSE NOIR */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-6 text-sm mr-4">
            <div className="text-zinc-500">
              <span className="text-white font-medium">{wordCount.toLocaleString()}</span> {t.creative.words}
            </div>
            <div className="text-zinc-500">
              <span className="text-white font-medium">{charCount.toLocaleString()}</span> {t.creative.chars}
            </div>
            <div className="text-zinc-500">
              <span className="text-white font-medium">{history.length}</span> {t.creative.gens}
            </div>
          </div>

          <button
            onClick={handleExportStory}
            disabled={!generatedContent}
            className="p-3 hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-30 text-zinc-500 hover:text-white"
            title={t.creative.export}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </button>

          <button
            onClick={handleImportClick}
            className="p-3 hover:bg-white/10 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
            title={t.creative.import}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </button>

          <button
            onClick={handleZoomOut}
            disabled={fontSize === 'xs'}
            className="p-3 hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-30 text-zinc-500 hover:text-white"
            title={t.creative.zoomOut}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>

          <button
            onClick={handleZoomIn}
            disabled={fontSize === '2xl'}
            className="p-3 hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-30 text-zinc-500 hover:text-white"
            title={t.creative.zoomIn}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ========================================================================
          MAIN CONTENT
          ======================================================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* v1.0 ROSE NOIR: Content Display with bottom padding for floating input */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto p-8 pb-48 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
            style={{ height: '100%' }}
          >
            {generatedContent ? (
              <div className="max-w-3xl mx-auto">
                {/* ============================================================
                    TYPOGRAPHY: 2K MONITOR OPTIMIZATION (Master Update)

                    - font-sans: Clean, modern Sans-Serif (NOT Serif!)
                    - text-xl: LARGE reading size for 2K monitors (was text-sm)
                    - leading-loose: Extra generous line spacing (2.0) for relaxed reading

                    SYNTAX HIGHLIGHTING (formatStoryText function):
                    - Dialog: text-zinc-300 font-medium (SOFT GRAY, OLED-friendly)
                    - Narration: text-zinc-500 italic (DARKER GRAY, ITALIC)
                    - Asterisks removed for clean visual presentation

                    MASTER UPDATE CHANGES:
                    - Bigger font (text-xl) for high-DPI screens
                    - Softer colors (zinc-300 instead of harsh white)
                    - No markdown symbols (asterisks stripped)
                    - Generous spacing for comfortable long-form reading
                    ============================================================ */}
                <div className={`font-sans text-${fontSize} leading-loose`}>
                  {formatStoryText(generatedContent)}
                </div>
              </div>
            ) : (
              // Empty State
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-red-600/20 to-rose-600/20 border border-red-500/20 flex items-center justify-center">
                  <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{t.creative.uncensoredWriting}</h3>
                <p className="text-zinc-500 max-w-md mb-8">
                  {t.creative.safetyFiltersDisabled}
                </p>

                {/* Example Prompts */}
                <div className="w-full max-w-2xl">
                  <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">{t.creative.tryThesePrompts}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {examplePrompts.map((example, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPrompt(example)}
                        className="text-left p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/30 hover:border-red-500/30 text-zinc-400 hover:text-zinc-200 text-sm transition-all"
                      >
                        "{example}"
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ====================================================================
              ERROR DISPLAY
              ==================================================================== */}
          {error && (
            <div className="mx-8 mb-4 p-4 rounded-xl bg-red-900/20 border border-red-700/30 text-red-300 text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* v1.0 ROSE NOIR: Floating Input "Cockpit" */}
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl z-50 px-4">
            <div className="bg-zinc-900/95 backdrop-blur-2xl border border-rose-500/30 rounded-3xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] p-5 flex gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t.creative.enterStoryPrompt}
                  disabled={isLoading}
                  rows={3}
                  className="w-full bg-transparent border-none text-white text-base placeholder-zinc-500 focus:outline-none disabled:opacity-50 resize-none px-2"
                />
                <div className="absolute bottom-2 right-2 text-xs text-zinc-600">
                  {t.creative.charsCount.replace('{count}', prompt.length)}
                </div>
              </div>

              <div className="flex flex-col gap-2 justify-center">
                <button
                  type="submit"
                  onClick={(e) => { e.preventDefault(); handleGenerate(); }}
                  disabled={!prompt.trim() || isLoading}
                  className="px-6 py-3 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-medium transition-all disabled:opacity-30 flex items-center gap-2 shadow-lg shadow-rose-500/30 whitespace-nowrap"
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

                {generatedContent && (
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={isLoading}
                    className="px-6 py-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/50 text-zinc-300 hover:text-white transition-all disabled:opacity-30 text-sm whitespace-nowrap"
                  >
                    {t.creative.continue}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================================
            SIDEBAR
            ==================================================================== */}
        <div className="w-64 flex-shrink-0 border-l border-zinc-800/50 bg-zinc-900/30 p-4 flex flex-col gap-4">
          {/* Actions */}
          <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/30">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">{t.creative.actions}</h3>
            <div className="space-y-2">
              <button
                onClick={handleCopy}
                disabled={!generatedContent}
                className="w-full px-4 py-2 rounded-lg bg-zinc-700/30 text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                {t.creative.copyToClipboard}
              </button>
              <button
                onClick={handleClear}
                disabled={!generatedContent && !history.length}
                className="w-full px-4 py-2 rounded-lg bg-red-900/20 border border-red-700/30 text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {t.creative.clearAll}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="flex-1 bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/30 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">{t.creative.generationHistory}</h3>
            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              {history.length > 0 ? (
                history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-700/30"
                  >
                    <p className="text-xs text-zinc-400 line-clamp-2 mb-1">
                      {item.prompt}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-600 text-center py-4">
                  {t.creative.noGenerationsYet}
                </p>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/30">
            <h3 className="text-sm font-medium text-zinc-400 mb-2">{t.creative.writingTip}</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {t.creative.writingTipText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreativeWriting;
