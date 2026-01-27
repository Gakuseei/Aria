// ARIA v1.0 BLOCK 7.0 - Aria Monitor (Rose Noir Glass Theme)
import React, { useState, useEffect } from 'react';
import { X, Activity, Database, FileText, Gauge, Cpu, HardDrive, AlertTriangle, Copy, Trash2, CheckCircle2, Download, Filter } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import toast, { Toaster } from 'react-hot-toast';

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
  const [activeTab, setActiveTab] = useState('stats'); // stats, logs, state, network, errors
  const [localStorageData, setLocalStorageData] = useState({});
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [fps, setFps] = useState(60);
  const [errors, setErrors] = useState([]);
  const [expandedErrors, setExpandedErrors] = useState(new Set());
  const [severityFilter, setSeverityFilter] = useState('all'); // all, error, warning
  const errorListRef = React.useRef(null);
  const ERROR_LIMIT = 75;

  // Error Collection System
  useEffect(() => {
    const captureError = (severity, message, stack, source) => {
      setErrors(prev => {
        const newError = {
          id: Date.now() + Math.random(),
          severity,
          message: typeof message === 'string' ? message : String(message),
          stack: stack || '',
          source: source || 'Unknown',
          timestamp: Date.now()
        };
        
        const updated = [newError, ...prev];
        return updated.slice(0, ERROR_LIMIT);
      });
    };

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      const error = args.find(arg => arg instanceof Error);
      const stack = error?.stack || new Error().stack;
      const source = extractSourceFromStack(stack);
      
      captureError('error', message, stack, source);
      originalError(...args);
    };

    console.warn = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      captureError('warning', message, new Error().stack, 'Console Warning');
      originalWarn(...args);
    };

    const handleRejection = (event) => {
      const message = event.reason?.message || String(event.reason);
      const stack = event.reason?.stack || '';
      const source = extractSourceFromStack(stack);
      
      captureError('error', `Unhandled Promise Rejection: ${message}`, stack, source);
    };

    const handleError = (event) => {
      const message = event.error?.message || event.message || 'Unknown Error';
      const stack = event.error?.stack || '';
      const source = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : extractSourceFromStack(stack);
      
      captureError('error', message, stack, source);
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, [ERROR_LIMIT]);

  const extractSourceFromStack = (stack) => {
    if (!stack) return 'Unknown';
    
    const lines = stack.split('\n');
    for (let line of lines) {
      const match = line.match(/at\s+(?:.*\s+)?\(?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        const [, file, lineNum] = match;
        const fileName = file.split('/').pop().split('\\').pop();
        return `${fileName}:${lineNum}`;
      }
    }
    
    return 'Unknown';
  };

  // Auto-scroll to newest error when errors change
  useEffect(() => {
    if (activeTab === 'errors' && errorListRef.current && errors.length > 0) {
      errorListRef.current.scrollTop = 0;
    }
  }, [errors.length, activeTab]);

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

  const formatFullDate = (timestamp) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = formatTime(timestamp);
    return `${year}-${month}-${day} ${time}`;
  };

  const getPlatformInfo = () => {
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    
    let os = 'Unknown OS';
    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    
    return `${os} (${platform})`;
  };

  const copyError = (error) => {
    const errorText = `[${error.severity.toUpperCase()}] ${formatFullDate(error.timestamp)}
App Version: 1.0.0
Platform: ${getPlatformInfo()}
Location: ${error.source}
Message: ${error.message}
${error.stack ? `\nStack Trace:\n${error.stack}` : ''}`;

    navigator.clipboard.writeText(errorText).then(() => {
      toast.success('Copied!', {
        duration: 1500,
        style: {
          background: '#18181b',
          color: '#fff',
          border: '1px solid rgba(34, 197, 94, 0.5)'
        }
      });
    }).catch(() => {
      toast.error('Failed to copy', { duration: 1500 });
    });
  };

  const copyAllErrors = () => {
    if (errors.length === 0) return;

    const allErrorsText = `ARIA ERROR REPORT
Generated: ${formatFullDate(Date.now())}
App Version: 1.0.0
Platform: ${getPlatformInfo()}
Total Errors: ${errors.length}

${'='.repeat(80)}

${errors.map((error, index) => `
ERROR #${index + 1}
${'-'.repeat(80)}
[${error.severity.toUpperCase()}] ${formatFullDate(error.timestamp)}
Location: ${error.source}
Message: ${error.message}
${error.stack ? `\nStack Trace:\n${error.stack}` : ''}
`).join('\n' + '='.repeat(80) + '\n')}`;

    navigator.clipboard.writeText(allErrorsText).then(() => {
      toast.success('Copied!', {
        duration: 1500,
        style: {
          background: '#18181b',
          color: '#fff',
          border: '1px solid rgba(34, 197, 94, 0.5)'
        }
      });
    }).catch(() => {
      toast.error('Failed to copy', { duration: 1500 });
    });
  };

  const clearAllErrors = () => {
    setErrors([]);
    setExpandedErrors(new Set());
    toast.success(t.debugConsole.errorsCleared || 'Cleared!', {
      duration: 1500,
      style: {
        background: '#18181b',
        color: '#fff',
        border: '1px solid rgba(34, 197, 94, 0.5)'
      }
    });
  };

  const toggleErrorExpanded = (errorId) => {
    setExpandedErrors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(errorId)) {
        newSet.delete(errorId);
      } else {
        newSet.add(errorId);
      }
      return newSet;
    });
  };

  const exportErrorLog = () => {
    if (errors.length === 0) {
      toast.error('No errors to export', { duration: 1500 });
      return;
    }

    const logContent = `ARIA ERROR LOG
Generated: ${formatFullDate(Date.now())}
App Version: 1.0.0
Platform: ${getPlatformInfo()}
Total Errors: ${errors.length}

${'='.repeat(80)}

${errors.map((error, index) => `
ERROR #${index + 1}
${'-'.repeat(80)}
Severity: ${error.severity.toUpperCase()}
Timestamp: ${formatFullDate(error.timestamp)}
Location: ${error.source}
Message: ${error.message}
${error.stack ? `\nStack Trace:\n${error.stack}` : ''}
`).join('\n' + '='.repeat(80) + '\n')}`;

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aria-errors-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Log exported!', {
      duration: 1500,
      style: {
        background: '#18181b',
        color: '#fff',
        border: '1px solid rgba(34, 197, 94, 0.5)'
      }
    });
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
    { id: 'network', label: t.debugConsole.network, icon: Activity },
    { id: 'errors', label: t.debugConsole.errors || 'Errors', icon: AlertTriangle, badge: errors.length }
  ];

  return (
    <>
      <Toaster position="top-right" />
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
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 relative ${
                    activeTab === tab.id
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 border border-white/5'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                  {tab.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
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
                      <p className="text-xl font-bold text-white">{settings?.ollamaModel || lastApiModel || 'hermes3'}</p>
                      {settings?.ollamaModel && lastApiModel && lastApiModel !== settings.ollamaModel && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Last response: {lastApiModel}
                        </p>
                      )}
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
                    <div className="flex justify-between col-span-2">
                      <span className="text-zinc-400">{t.debugConsole.model}:</span>
                      <span className="text-rose-400 font-mono font-bold">{settings.ollamaModel || 'hermes3'}</span>
                    </div>
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

          {/* ERRORS TAB */}
          {activeTab === 'errors' && (
            <div className="space-y-3">
              {errors.length > 0 ? (
                <>
                  {/* Header Actions */}
                  <div className="flex items-center justify-between mb-4 sticky top-0 glass rounded-xl p-3 border border-white/5 z-10">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={20} className="text-rose-400" />
                        <span className="text-sm font-bold text-white">
                          {errors.filter(e => severityFilter === 'all' || e.severity === severityFilter).length} {t.debugConsole.errors || 'Errors'}
                        </span>
                      </div>
                      
                      {/* Severity Filter */}
                      <div className="flex gap-1 border border-white/10 rounded-lg p-1">
                        <button
                          onClick={() => setSeverityFilter('all')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                            severityFilter === 'all' 
                              ? 'bg-white/10 text-white' 
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setSeverityFilter('error')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                            severityFilter === 'error' 
                              ? 'bg-rose-500/20 text-rose-300' 
                              : 'text-zinc-500 hover:text-rose-400'
                          }`}
                        >
                          Errors
                        </button>
                        <button
                          onClick={() => setSeverityFilter('warning')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                            severityFilter === 'warning' 
                              ? 'bg-amber-500/20 text-amber-300' 
                              : 'text-zinc-500 hover:text-amber-400'
                          }`}
                        >
                          Warnings
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={exportErrorLog}
                        className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border-2 border-transparent hover:border-purple-500/50"
                      >
                        <Download size={14} />
                        Export .log
                      </button>
                      <button
                        onClick={copyAllErrors}
                        className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border-2 border-transparent hover:border-cyan-500/50"
                      >
                        <Copy size={14} />
                        {t.debugConsole.copyAll || 'Copy All'}
                      </button>
                      <button
                        onClick={clearAllErrors}
                        className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border-2 border-transparent hover:border-rose-500/50"
                      >
                        <Trash2 size={14} />
                        {t.debugConsole.clearAll || 'Clear All'}
                      </button>
                    </div>
                  </div>

                  {/* Error List */}
                  <div ref={errorListRef} className="space-y-3">
                  {errors
                    .filter(error => severityFilter === 'all' || error.severity === severityFilter)
                    .map((error) => {
                    const isExpanded = expandedErrors.has(error.id);
                    const severityStyles = {
                      error: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
                      warning: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
                      critical: 'bg-red-600/30 text-red-200 border-red-600/60'
                    };

                    return (
                      <div key={error.id} className="glass rounded-xl p-4 border border-white/5 space-y-3">
                        {/* Error Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold border ${severityStyles[error.severity] || severityStyles.error}`}>
                                {error.severity.toUpperCase()}
                              </span>
                              <span className="text-xs text-zinc-500 font-mono">{formatTime(error.timestamp)}</span>
                              {error.source !== 'Unknown' && (
                                <span className="px-2 py-1 bg-zinc-800/50 text-cyan-400 rounded text-xs font-mono border border-cyan-500/30">
                                  {error.source}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-zinc-300 break-words">{error.message}</p>
                          </div>
                          
                          <button
                            onClick={() => copyError(error)}
                            className="p-2 hover:bg-white/5 rounded-lg transition-all flex-shrink-0 border-2 border-transparent hover:border-rose-500"
                            title={t.debugConsole.copyError || 'Copy Error'}
                          >
                            <Copy size={16} className="text-zinc-400 hover:text-rose-400" />
                          </button>
                        </div>

                        {/* Stack Trace Toggle */}
                        {error.stack && (
                          <div className="space-y-2">
                            <button
                              onClick={() => toggleErrorExpanded(error.id)}
                              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                            >
                              {isExpanded ? (t.debugConsole.hideStack || '▼ Hide Stack Trace') : (t.debugConsole.showStack || '▶ Show Stack Trace')}
                            </button>
                            
                            {isExpanded && (
                              <div className="bg-black/50 rounded-lg p-3 max-h-60 overflow-y-auto border border-zinc-800">
                                <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap break-words">
                                  {error.stack}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white mb-1">
                      {t.debugConsole.allStable || 'All Stable'}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {t.debugConsole.noErrorsSinceStart || 'No errors detected since app start'}
                    </p>
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
    </>
  );
}
