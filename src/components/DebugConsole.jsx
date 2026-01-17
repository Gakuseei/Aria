// ARIA v1.0 BLOCK 7.0 - Aria Monitor (Rose Noir Glass Theme)
import React, { useState, useEffect } from 'react';
import { X, Activity, Database, FileText, Gauge, Cpu, HardDrive } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function DebugConsole({
  isVisible,
  onClose,
  scaleFactor,
  oledMode,
  animationsEnabled,
  currentView,
  lastApiResponseTime,
  lastResponseWords,
  lastResponseTokens,
  lastApiModel,
  lastApiWPS,
  eventLog,
  settings
}) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('stats'); // stats, logs, state, network
  const [localStorageData, setLocalStorageData] = useState({});
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [fps, setFps] = useState(60);

  // FPS Monitor
  useEffect(() => {
    if (!isVisible) return;
    let lastTime = performance.now();
    let frames = 0;

    const measureFps = () => {
      frames++;
      const currentTime = performance.now();
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round((frames * 1000) / (currentTime - lastTime)));
        frames = 0;
        lastTime = currentTime;
      }
      requestAnimationFrame(measureFps);
    };

    const rafId = requestAnimationFrame(measureFps);
    return () => cancelAnimationFrame(rafId);
  }, [isVisible]);

  // Load localStorage
  useEffect(() => {
    if (isVisible) {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          const value = localStorage.getItem(key);
          try {
            data[key] = JSON.parse(value);
          } catch {
            data[key] = value;
          }
        } catch (e) {
          data[key] = '<error reading>';
        }
      }
      setLocalStorageData(data);

      if (performance && performance.memory) {
        setMemoryUsage({
          used: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
          total: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2),
          limit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)
        });
      }
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const scalePercentage = {
    'small': '87.5%',
    'medium': '100%',
    'large': '125%'
  }[scaleFactor] || '100%';

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getApiStatusColor = () => {
    if (!lastApiResponseTime) return 'text-zinc-500';
    if (lastApiResponseTime < 500) return 'text-green-400';
    if (lastApiResponseTime < 2000) return 'text-amber-400';
    return 'text-rose-400';
  };

  const tabs = [
    { id: 'stats', label: t.debugConsole.liveStats, icon: Gauge },
    { id: 'logs', label: t.debugConsole.logs, icon: FileText },
    { id: 'state', label: t.debugConsole.state, icon: Database },
    { id: 'network', label: t.debugConsole.network, icon: Activity }
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md pointer-events-auto" onClick={onClose} />

      {/* BLOCK 7.0: Rose Noir Glass Dashboard */}
      <div className="relative w-full max-w-6xl h-[85vh] glass rounded-2xl shadow-2xl pointer-events-auto overflow-hidden border border-rose-500/30">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-rose-950/30 to-pink-950/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
                <Activity size={20} className="text-rose-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{t.debugConsole.title}</h2>
                <p className="text-xs text-zinc-500">{t.debugConsole.subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-all"
            >
              <X size={20} className="text-zinc-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 border border-white/5'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto h-[calc(100%-12rem)]">
          {/* STATS TAB */}
          {activeTab === 'stats' && (
            <div className="grid grid-cols-3 gap-4">
              {/* FPS Card */}
              <div className="glass rounded-xl p-5 border border-white/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <Gauge size={20} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">{t.debugConsole.frameRate}</p>
                    <p className="text-2xl font-bold text-white">{fps} FPS</p>
                  </div>
                </div>
              </div>

              {/* Memory Card */}
              {memoryUsage && (
                <div className="glass rounded-xl p-5 border border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <HardDrive size={20} className="text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500">{t.debugConsole.memory}</p>
                      <p className="text-2xl font-bold text-white">{memoryUsage.used} MB</p>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {memoryUsage.total} MB {t.debugConsole.total}
                  </div>
                </div>
              )}

              {/* Tokens/Sec Card */}
              {lastApiWPS !== null && (
                <div className="glass rounded-xl p-5 border border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Activity size={20} className="text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500">{t.debugConsole.wordsPerSec}</p>
                      <p className="text-2xl font-bold text-white">{lastApiWPS}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* UI Scale */}
              <div className="glass rounded-xl p-5 border border-white/5 col-span-2">
                <p className="text-sm text-zinc-500 mb-2">{t.debugConsole.uiScale}</p>
                <p className="text-3xl font-bold text-white">{scalePercentage}</p>
                <p className="text-xs text-zinc-500 mt-2">{t.debugConsole.current}: {scaleFactor}</p>
              </div>

              {/* Mode Indicators */}
              <div className="glass rounded-xl p-5 border border-white/5">
                <p className="text-sm text-zinc-500 mb-3">{t.debugConsole.modes}</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{t.debugConsole.oled}</span>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      oledMode ? 'bg-green-500/20 text-green-300' : 'bg-zinc-700 text-zinc-400'
                    }`}>
                      {oledMode ? t.debugConsole.on : t.debugConsole.off}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{t.debugConsole.animations}</span>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      animationsEnabled ? 'bg-green-500/20 text-green-300' : 'bg-zinc-700 text-zinc-400'
                    }`}>
                      {animationsEnabled ? t.debugConsole.on : t.debugConsole.off}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LOGS TAB */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              {eventLog && eventLog.length > 0 ? (
                eventLog.map((event, index) => (
                  <div key={index} className="glass rounded-xl p-4 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        event.type === 'settings' ? 'bg-blue-500/20 text-blue-300' :
                        event.type === 'chat' ? 'bg-green-500/20 text-green-300' :
                        event.type === 'error' ? 'bg-rose-500/20 text-rose-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {event.type.toUpperCase()}
                      </span>
                      <span className="text-xs text-zinc-500 font-mono">{formatTime(event.timestamp)}</span>
                    </div>
                    <p className="text-sm text-zinc-300">{event.message}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-zinc-500 py-12">{t.debugConsole.noLogs}</p>
              )}
            </div>
          )}

          {/* STATE TAB - BLOCK 7.1: Filter internal keys */}
          {activeTab === 'state' && (
            <div className="space-y-3">
              {Object.keys(localStorageData)
                .filter(key => {
                  // BLOCK 7.1: Hide internal/sensitive keys
                  const hiddenKeys = ['isSupporter', 'passionGatekeepingEnabled', 'chatFontSize', 'storyFontSize'];
                  return !hiddenKeys.includes(key);
                })
                .map((key) => (
                  <div key={key} className="glass rounded-xl p-4 border border-white/5">
                    <p className="text-sm font-bold text-cyan-400 mb-2 font-mono">{key}</p>
                    <div className="bg-black/30 rounded-lg p-3 max-h-40 overflow-y-auto">
                      <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">
                        {typeof localStorageData[key] === 'object'
                          ? JSON.stringify(localStorageData[key], null, 2)
                          : localStorageData[key]}
                      </pre>
                    </div>
                  </div>
                ))
              }
              {Object.keys(localStorageData).filter(key => !['isSupporter', 'passionGatekeepingEnabled', 'chatFontSize', 'storyFontSize'].includes(key)).length === 0 && (
                <p className="text-center text-zinc-500 py-12">{t.debugConsole.noLogs}</p>
              )}
            </div>
          )}

          {/* NETWORK TAB */}
          {activeTab === 'network' && (
            <div className="space-y-4">
              <div className="glass rounded-xl p-6 border border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <Activity size={24} className="text-rose-400" />
                  <h3 className="text-lg font-bold text-white">{t.debugConsole.ollamaApi}</h3>
                </div>

                {lastApiResponseTime !== null ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-zinc-500 mb-1">{t.debugConsole.model}</p>
                      <p className="text-xl font-bold text-white">{lastApiModel || 'hermes3'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500 mb-1">{t.debugConsole.responseTime}</p>
                      <p className={`text-xl font-bold ${getApiStatusColor()}`}>
                        {lastApiResponseTime}ms
                      </p>
                    </div>
                    {lastResponseTokens !== null && (
                      <div>
                        <p className="text-sm text-zinc-500 mb-1">{t.debugConsole.tokens}</p>
                        <p className="text-xl font-bold text-purple-400">{lastResponseTokens}</p>
                      </div>
                    )}
                    {lastApiWPS !== null && (
                      <div>
                        <p className="text-sm text-zinc-500 mb-1">{t.debugConsole.wordsPerSec}</p>
                        <p className="text-xl font-bold text-cyan-400">{lastApiWPS}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-500">{t.debugConsole.noLogs}</p>
                )}
              </div>

              {settings && (
                <div className="glass rounded-xl p-6 border border-white/5">
                  <h3 className="text-lg font-bold text-white mb-4">{t.debugConsole.settingsOverview}</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">{t.debugConsole.userName}:</span>
                      <span className="text-white font-mono">{settings.userName || 'User'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">{t.debugConsole.gender}:</span>
                      <span className="text-white font-mono">{settings.userGender || 'male'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">{t.debugConsole.temperature}:</span>
                      <span className="text-amber-400 font-mono">{settings.temperature?.toFixed(2) || '0.85'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">{t.debugConsole.language}:</span>
                      <span className="text-blue-400 font-mono">{settings.preferredLanguage || 'en'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">{t.debugConsole.imageGen}:</span>
                      <span className={`font-mono ${settings.imageGenEnabled ? 'text-green-400' : 'text-rose-400'}`}>
                        {settings.imageGenEnabled ? t.debugConsole.on : t.debugConsole.off}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">{t.debugConsole.voiceTts}:</span>
                      <span className={`font-mono ${settings.voiceEnabled ? 'text-green-400' : 'text-rose-400'}`}>
                        {settings.voiceEnabled ? t.debugConsole.on : t.debugConsole.off}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/5 bg-zinc-950/50">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{t.debugConsole.footer}</span>
            <span>{t.debugConsole.view}: {currentView}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
