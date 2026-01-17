import React, { useState, useEffect } from 'react';
import { listSessions, deleteSession } from '../lib/api';
import { GAME_MODES } from '../App';
import { useLanguage } from '../context/LanguageContext';

function LoadGame({ onLoad, onBack }) {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [filter, setFilter] = useState('all');
  const [isVisible, setIsVisible] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // v1.0 ROSE NOIR: Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    const result = await listSessions();
    if (result.success) {
      // Sort by date, newest first
      const sorted = result.sessions.sort((a, b) => 
        new Date(b.savedAt) - new Date(a.savedAt)
      );
      setSessions(sorted);
    }
    setIsLoading(false);
  };

  // Handle delete
  const handleDelete = async (sessionId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this save?')) return;

    const result = await deleteSession(sessionId);
    if (result.success) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
      }
    }
  };

  // Handle load
  const handleLoad = () => {
    if (selectedSession) {
      onLoad({
        ...selectedSession,
        sessionId: selectedSession.id,
      });
    }
  };

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    if (filter === 'all') return true;
    return session.mode === filter;
  });

  // Format date
  const formatDate = (dateStr) => {
    try {
      if (!dateStr) return 'Unknown Date';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Unknown Date';
      
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return 'Unknown Date';
    }
  };

  // Get session icon
  const getSessionIcon = (mode) => {
    if (mode === GAME_MODES.CREATIVE_WRITING) {
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    );
  };

  return (
    <div className={`h-full w-full flex flex-col p-8 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black transition-all duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    }`}>
      {/* v1.0 ROSE NOIR: Premium Glass Header */}
      <div className="glass-header flex items-center justify-between px-6 py-5 mb-8 rounded-2xl">
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
            <h2 className="text-2xl font-bold text-white">Load Game</h2>
            <p className="text-zinc-500 text-sm">Continue a previous session</p>
          </div>
        </div>

        {/* Filter Tabs - v1.0 ROSE NOIR */}
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: GAME_MODES.CHARACTER_CHAT, label: 'Chat' },
            { id: GAME_MODES.CREATIVE_WRITING, label: 'Writing' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                filter === tab.id
                  ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30'
                  : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-rose-500/30 hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : filteredSessions.length > 0 ? (
            <div className="space-y-3">
              {filteredSessions.map((session, i) => (
                <div
                  key={session.id || i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedSession(session)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedSession(session);
                    }
                  }}
                  className={`w-full text-left p-5 rounded-xl transition-all duration-200 group cursor-pointer outline-none focus:ring-2 focus:ring-rose-500/50 ${
                    selectedSession?.id === session.id
                      ? 'glass border-2 border-rose-500/50 shadow-lg shadow-rose-500/10'
                      : 'glass-light hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon - v1.0 ROSE NOIR */}
                    <div className={`p-3 rounded-xl ${
                      session.mode === GAME_MODES.CREATIVE_WRITING
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/20'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/20'
                    }`}>
                      {getSessionIcon(session.mode)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-white truncate">
                          {session.mode === GAME_MODES.CHARACTER_CHAT
                            ? `Chat with ${session.characterName || 'Character'}`
                            : 'Creative Writing Session'
                          }
                        </h3>
                        <span className="text-xs text-zinc-500">
                          {formatDate(session.savedAt)}
                        </span>
                      </div>

                      <p className="text-sm text-zinc-500 mb-3">
                        {session.mode === GAME_MODES.CHARACTER_CHAT
                          ? `${session.messages?.length || 0} messages • Rapport: ${session.rapportLevel || 0}%`
                          : `${session.history?.length || 0} generations`
                        }
                      </p>

                      {/* Preview */}
                      <div className="text-xs text-zinc-600 line-clamp-2">
                        {session.mode === GAME_MODES.CHARACTER_CHAT
                          ? session.messages?.[session.messages.length - 1]?.content?.substring(0, 100)
                          : session.content?.substring(0, 100)
                        }
                        ...
                      </div>
                    </div>

                    {/* Delete Button - v1.0 ROSE NOIR */}
                    <button
                      onClick={(e) => handleDelete(session.id, e)}
                      className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition-all z-10"
                      title="Delete Save"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-800/50 flex items-center justify-center text-zinc-600">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-zinc-400 mb-2">No Saves Found</h3>
              <p className="text-sm text-zinc-600 max-w-xs">
                Start a new game to create your first save. Your progress will be automatically saved.
              </p>
            </div>
          )}
        </div>

        {/* Preview Panel - v1.0 ROSE NOIR */}
        <div className="w-80 flex-shrink-0 glass rounded-2xl p-6 flex flex-col">
          {selectedSession ? (
            <>
              <div className="flex-1">
                <div className="text-sm text-zinc-500 mb-2">Selected Save</div>
                
                {/* Session Info */}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-1">
                    {selectedSession.mode === GAME_MODES.CHARACTER_CHAT
                      ? selectedSession.characterName || 'Character Chat'
                      : 'Creative Writing'
                    }
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Saved {formatDate(selectedSession.savedAt)}
                  </p>
                </div>

                {/* Stats */}
                <div className="space-y-4">
                  {selectedSession.mode === GAME_MODES.CHARACTER_CHAT ? (
                    <>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50">
                        <span className="text-sm text-zinc-400">Messages</span>
                        <span className="text-white font-medium">{selectedSession.messages?.length || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50">
                        <span className="text-sm text-zinc-400">Rapport Level</span>
                        <span className="text-white font-medium">{selectedSession.rapportLevel || 0}%</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50">
                        <span className="text-sm text-zinc-400">Current Mood</span>
                        <span className="text-white font-medium capitalize">{selectedSession.currentMood || 'default'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50">
                        <span className="text-sm text-zinc-400">Generations</span>
                        <span className="text-white font-medium">{selectedSession.history?.length || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50">
                        <span className="text-sm text-zinc-400">Content Length</span>
                        <span className="text-white font-medium">{selectedSession.content?.length || 0} chars</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Load Button - v1.0 ROSE NOIR */}
              <button
                onClick={handleLoad}
                className="w-full py-4 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Continue Session
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 mb-4 rounded-xl bg-zinc-700/30 flex items-center justify-center text-zinc-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">
                {t.loadGame?.selectSave || "Select a save to preview and continue"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoadGame;
