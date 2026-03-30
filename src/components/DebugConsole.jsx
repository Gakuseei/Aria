import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileText,
  Gauge,
  HardDrive,
  Trash2,
  X,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { version as appVersion } from '../../package.json';
import { useLanguage } from '../context/LanguageContext';
import {
  appendCapturedError,
  buildErrorExportPayload,
  collectStorageSnapshot,
  createCapturedError,
  DEBUG_CONSOLE_ERROR_LIMIT,
  extractSourceFromStack,
  formatConsoleArgs,
  summarizeDebugHealth,
} from '../lib/debugConsole';
import downloadBlob from '../utils/downloadBlob';

const SCALE_PERCENTAGES = {
  small: '87.5%',
  medium: '100%',
  large: '125%',
};

const TAB_ICONS = {
  stats: Gauge,
  logs: FileText,
  state: Database,
  network: Activity,
  errors: AlertTriangle,
};

const EVENT_TYPE_STYLES = {
  settings: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  chat: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  api: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  passion: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  builder: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  default: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

const SEVERITY_STYLES = {
  error: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
  warning: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  critical: 'bg-red-600/20 text-red-100 border-red-500/50',
};

function getPlatformInfo() {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;

  let operatingSystem = 'Unknown';
  if (userAgent.includes('Win')) operatingSystem = 'Windows';
  else if (userAgent.includes('Mac')) operatingSystem = 'macOS';
  else if (userAgent.includes('Linux')) operatingSystem = 'Linux';

  return `${operatingSystem} (${platform})`;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatFullDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} ${formatTime(timestamp)}`;
}

function getApiStatusTone(lastApiResponseTime) {
  if (typeof lastApiResponseTime !== 'number') {
    return 'text-zinc-400';
  }

  if (lastApiResponseTime < 500) {
    return 'text-emerald-300';
  }

  if (lastApiResponseTime < 2000) {
    return 'text-amber-300';
  }

  return 'text-rose-300';
}

function getHealthTone(status) {
  if (status === 'healthy') return 'text-emerald-300';
  if (status === 'warning') return 'text-amber-300';
  return 'text-rose-300';
}

function createDiagnosticsPayload({
  currentView,
  errors,
  eventLog,
  healthSummary,
  settings,
}) {
  return buildErrorExportPayload({
    appVersion,
    currentView,
    errors,
    eventLog,
    healthSummary,
    platform: getPlatformInfo(),
    settings,
  });
}

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
  settings,
}) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('stats');
  const [storageEntries, setStorageEntries] = useState([]);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [fps, setFps] = useState(60);
  const [errors, setErrors] = useState([]);
  const [expandedErrors, setExpandedErrors] = useState(() => new Set());
  const [severityFilter, setSeverityFilter] = useState('all');
  const errorListRef = useRef(null);
  const fpsRafRef = useRef(null);
  const errorIdRef = useRef(1);

  const filteredErrors = useMemo(() => {
    return errors.filter((entry) => severityFilter === 'all' || entry.severity === severityFilter);
  }, [errors, severityFilter]);

  const healthSummary = useMemo(() => {
    return summarizeDebugHealth({
      errors,
      eventLog,
      lastApiResponseTime,
      lastApiWps: lastApiWPS,
    });
  }, [errors, eventLog, lastApiResponseTime, lastApiWPS]);

  const tabs = useMemo(() => {
    return [
      { id: 'stats', label: t.debugConsole.liveStats },
      { id: 'logs', label: t.debugConsole.logs },
      { id: 'state', label: t.debugConsole.state },
      { id: 'network', label: t.debugConsole.network },
      { id: 'errors', label: t.debugConsole.errors, badge: errors.length },
    ];
  }, [errors.length, t.debugConsole]);

  useEffect(() => {
    if (!isVisible) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible, onClose]);

  useEffect(() => {
    const pushError = ({ severity, message, stack = '', source }) => {
      setErrors((existing) => appendCapturedError(
        existing,
        createCapturedError({
          id: errorIdRef.current += 1,
          severity,
          message,
          stack,
          source,
          timestamp: Date.now(),
        }),
        { limit: DEBUG_CONSOLE_ERROR_LIMIT },
      ));
    };

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      const error = args.find((entry) => entry instanceof Error);
      const stack = error?.stack || new Error().stack || '';
      pushError({
        severity: 'error',
        message: formatConsoleArgs(args),
        stack,
        source: extractSourceFromStack(stack),
      });
      originalError(...args);
    };

    console.warn = (...args) => {
      const stack = new Error().stack || '';
      const message = formatConsoleArgs(args);
      if (!message.startsWith('[Cleaner] ')) {
        pushError({
          severity: 'warning',
          message,
          stack,
          source: extractSourceFromStack(stack),
        });
      }
      originalWarn(...args);
    };

    const handleRejection = (event) => {
      const stack = event.reason?.stack || '';
      pushError({
        severity: 'error',
        message: `Unhandled Promise Rejection: ${event.reason?.message || String(event.reason)}`,
        stack,
        source: extractSourceFromStack(stack),
      });
    };

    const handleError = (event) => {
      const stack = event.error?.stack || '';
      pushError({
        severity: 'error',
        message: event.error?.message || event.message || 'Unknown Error',
        stack,
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : extractSourceFromStack(stack),
      });
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      if (fpsRafRef.current) {
        cancelAnimationFrame(fpsRafRef.current);
        fpsRafRef.current = null;
      }
      return undefined;
    }

    let frameCount = 0;
    let lastTime = performance.now();

    const measureFps = (currentTime) => {
      frameCount += 1;
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      fpsRafRef.current = requestAnimationFrame(measureFps);
    };

    fpsRafRef.current = requestAnimationFrame(measureFps);

    return () => {
      if (fpsRafRef.current) {
        cancelAnimationFrame(fpsRafRef.current);
        fpsRafRef.current = null;
      }
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    setStorageEntries(collectStorageSnapshot(window.localStorage));

    if (performance?.memory) {
      setMemoryUsage({
        used: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
        total: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2),
        limit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
      });
      return;
    }

    setMemoryUsage(null);
  }, [isVisible]);

  useEffect(() => {
    if (activeTab === 'errors' && errorListRef.current && filteredErrors.length > 0) {
      errorListRef.current.scrollTop = 0;
    }
  }, [activeTab, filteredErrors.length]);

  if (!isVisible) {
    return null;
  }

  const diagnosticsPayload = createDiagnosticsPayload({
    currentView,
    errors,
    eventLog,
    healthSummary,
    settings,
  });

  const copyText = async (payload) => {
    if (!navigator.clipboard?.writeText) {
      toast.error(t.debugConsole.copyFailed, { duration: 1500 });
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      toast.success(t.debugConsole.copied, { duration: 1500 });
    } catch {
      toast.error(t.debugConsole.copyFailed, { duration: 1500 });
    }
  };

  const copyError = async (error) => {
    const payload = createDiagnosticsPayload({
      currentView,
      errors: [error],
      eventLog,
      healthSummary,
      settings,
    });

    await copyText(JSON.stringify(payload, null, 2));
  };

  const copyAllErrors = async () => {
    if (errors.length === 0) {
      toast.error(t.debugConsole.noErrorsToExport, { duration: 1500 });
      return;
    }

    await copyText(JSON.stringify(diagnosticsPayload, null, 2));
  };

  const clearAllErrors = () => {
    setErrors([]);
    setExpandedErrors(new Set());
    toast.success(t.debugConsole.errorsCleared, { duration: 1500 });
  };

  const exportErrorLog = () => {
    if (errors.length === 0) {
      toast.error(t.debugConsole.noErrorsToExport, { duration: 1500 });
      return;
    }

    const blob = new Blob([JSON.stringify(diagnosticsPayload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `aria-diagnostics-${Date.now()}.json`);
    toast.success(t.debugConsole.logExported, { duration: 1500 });
  };

  const toggleErrorExpanded = (errorId) => {
    setExpandedErrors((previous) => {
      const next = new Set(previous);
      if (next.has(errorId)) {
        next.delete(errorId);
      } else {
        next.add(errorId);
      }
      return next;
    });
  };

  const summaryCards = [
    {
      label: t.debugConsole.errors,
      value: healthSummary.recentErrors > 0 ? String(healthSummary.recentErrors) : t.debugConsole.noErrors,
      tone: getHealthTone(healthSummary.overallStatus),
    },
    {
      label: t.debugConsole.network,
      value: typeof lastApiResponseTime === 'number' ? `${lastApiResponseTime}ms` : t.debugConsole.noLogs,
      tone: getApiStatusTone(lastApiResponseTime),
    },
    {
      label: t.debugConsole.logs,
      value: `${eventLog.length}`,
      tone: 'text-cyan-300',
    },
    {
      label: t.debugConsole.view,
      value: currentView,
      tone: 'text-zinc-100',
    },
  ];

  return (
    <>
      <Toaster position="top-right" />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-3 py-4 pointer-events-none">
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md pointer-events-auto" onClick={onClose} />
        <div className="relative flex h-[88vh] max-h-[920px] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-rose-500/30 bg-zinc-950/90 shadow-2xl pointer-events-auto">
          <div className="border-b border-white/5 bg-gradient-to-r from-rose-950/40 to-pink-950/20 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20">
                  <Activity size={20} className="text-rose-300" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-white">{t.debugConsole.title}</h2>
                  <p className="text-xs text-zinc-400">{t.debugConsole.subtitle}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg border-2 border-transparent p-2 text-zinc-400 transition-colors hover:border-rose-500 hover:bg-white/5 hover:text-white"
                title={t.debugConsole.clear}
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <div key={card.label} className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{card.label}</p>
                  <p className={`mt-2 truncate text-sm font-semibold ${card.tone}`}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = TAB_ICONS[tab.id];
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                        : 'border-white/5 bg-zinc-900/60 text-zinc-400 hover:border-rose-500/40 hover:text-zinc-100'
                    }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                    {tab.badge > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {activeTab === 'stats' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
                        <Gauge size={20} className="text-cyan-300" />
                      </div>
                      <div>
                        <p className="text-sm text-zinc-400">{t.debugConsole.frameRate}</p>
                        <p className="text-2xl font-bold text-white">{fps} FPS</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15">
                        <Activity size={20} className="text-amber-300" />
                      </div>
                      <div>
                        <p className="text-sm text-zinc-400">{t.debugConsole.responseTime}</p>
                        <p className={`text-2xl font-bold ${getApiStatusTone(lastApiResponseTime)}`}>
                          {typeof lastApiResponseTime === 'number' ? `${lastApiResponseTime}ms` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/15">
                        <HardDrive size={20} className="text-purple-300" />
                      </div>
                      <div>
                        <p className="text-sm text-zinc-400">{t.debugConsole.memory}</p>
                        <p className="text-2xl font-bold text-white">{memoryUsage ? `${memoryUsage.used} MB` : '—'}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">
                      {memoryUsage ? `${memoryUsage.total} MB ${t.debugConsole.total} • ${memoryUsage.limit} MB limit` : t.debugConsole.noLogs}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15">
                        <FileText size={20} className="text-emerald-300" />
                      </div>
                      <div>
                        <p className="text-sm text-zinc-400">{t.debugConsole.words}</p>
                        <p className="text-2xl font-bold text-white">{typeof lastResponseWords === 'number' ? lastResponseWords : '—'}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">
                      {typeof lastApiWPS === 'number' ? `${lastApiWPS} ${t.debugConsole.wps}` : t.debugConsole.noLogs}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                    <p className="text-sm text-zinc-400">{t.debugConsole.systemInfo}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-500">{t.debugConsole.view}</span>
                        <span className="truncate font-mono text-zinc-100">{currentView}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-500">{t.debugConsole.uiScale}</span>
                        <span className="font-mono text-zinc-100">{SCALE_PERCENTAGES[scaleFactor] || SCALE_PERCENTAGES.medium}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-500">{t.debugConsole.model}</span>
                        <span className="truncate font-mono text-rose-300">{settings?.ollamaModel || lastApiModel || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-500">{t.debugConsole.tokens}</span>
                        <span className="font-mono text-zinc-100">{typeof lastResponseTokens === 'number' ? lastResponseTokens : '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                    <p className="text-sm text-zinc-400">{t.debugConsole.modes}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-500">{t.debugConsole.oled}</span>
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${oledMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                          {oledMode ? t.debugConsole.on : t.debugConsole.off}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-500">{t.debugConsole.animations}</span>
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${animationsEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                          {animationsEnabled ? t.debugConsole.on : t.debugConsole.off}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-500">{t.debugConsole.language}</span>
                        <span className="rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100">{settings?.preferredLanguage || 'en'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-3">
                {eventLog.length > 0 ? eventLog.map((event, index) => {
                  const typeTone = EVENT_TYPE_STYLES[event.type] || EVENT_TYPE_STYLES.default;
                  const eventTimestamp = event.timestamp ? new Date(event.timestamp).getTime() : Date.now();
                  return (
                    <div key={`${event.type}-${event.message}-${index}`} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${typeTone}`}>
                              {event.type}
                            </span>
                            <span className="text-xs font-mono text-zinc-500">{formatTime(eventTimestamp)}</span>
                          </div>
                          <p className="break-words text-sm text-zinc-200">{event.message}</p>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
                    <FileText size={28} className="text-zinc-500" />
                    <p className="mt-4 text-base font-semibold text-white">{t.debugConsole.logs}</p>
                    <p className="mt-2 max-w-md text-sm text-zinc-500">{t.debugConsole.noLogs}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'state' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t.debugConsole.localStorage}</p>
                      <p className="mt-2 text-lg font-semibold text-white">{storageEntries.length}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t.debugConsole.model}</p>
                      <p className="mt-2 truncate text-sm font-semibold text-rose-300">{settings?.ollamaModel || lastApiModel || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t.debugConsole.userName}</p>
                      <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{settings?.userName || 'User'}</p>
                    </div>
                  </div>
                </div>

                {storageEntries.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {storageEntries.map((entry) => (
                      <div key={entry.key} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-cyan-300 font-mono">{entry.key}</p>
                          <span className="rounded bg-zinc-900 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-400">{entry.kind}</span>
                        </div>
                        <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-black/30 p-3">
                          <pre className="whitespace-pre-wrap break-words text-xs text-zinc-400">{entry.preview}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
                    <Database size={28} className="text-zinc-500" />
                    <p className="mt-4 text-base font-semibold text-white">{t.debugConsole.state}</p>
                    <p className="mt-2 max-w-md text-sm text-zinc-500">{t.debugConsole.noLogs}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'network' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6">
                  <div className="flex items-center gap-3">
                    <Activity size={22} className="text-rose-300" />
                    <h3 className="text-lg font-bold text-white">{t.debugConsole.ollamaApi}</h3>
                  </div>

                  {typeof lastApiResponseTime === 'number' ? (
                    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-zinc-500">{t.debugConsole.model}</p>
                        <p className="mt-1 text-lg font-semibold text-white">{settings?.ollamaModel || lastApiModel || '—'}</p>
                        {settings?.ollamaModel && lastApiModel && lastApiModel !== settings.ollamaModel && (
                          <p className="mt-2 text-xs text-zinc-500">{lastApiModel}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-zinc-500">{t.debugConsole.responseTime}</p>
                        <p className={`mt-1 text-lg font-semibold ${getApiStatusTone(lastApiResponseTime)}`}>{lastApiResponseTime}ms</p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-500">{t.debugConsole.words}</p>
                        <p className="mt-1 text-lg font-semibold text-white">{typeof lastResponseWords === 'number' ? lastResponseWords : '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-500">{t.debugConsole.tokens}</p>
                        <p className="mt-1 text-lg font-semibold text-purple-300">{typeof lastResponseTokens === 'number' ? lastResponseTokens : '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-500">{t.debugConsole.wordsPerSec}</p>
                        <p className="mt-1 text-lg font-semibold text-cyan-300">{typeof lastApiWPS === 'number' ? lastApiWPS : '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                      <Activity size={28} className="text-zinc-500" />
                      <p className="mt-4 text-base font-semibold text-white">{t.debugConsole.network}</p>
                      <p className="mt-2 max-w-md text-sm text-zinc-500">{t.debugConsole.noLogs}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6">
                  <h3 className="text-lg font-bold text-white">{t.debugConsole.settingsOverview}</h3>
                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.debugConsole.userName}</span>
                      <span className="truncate font-mono text-zinc-100">{settings?.userName || 'User'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.debugConsole.gender}</span>
                      <span className="font-mono text-zinc-100">{settings?.userGender || 'male'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.debugConsole.temperature}</span>
                      <span className="font-mono text-amber-300">{typeof settings?.temperature === 'number' ? settings.temperature.toFixed(2) : '0.85'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.debugConsole.language}</span>
                      <span className="font-mono text-blue-300">{settings?.preferredLanguage || 'en'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.debugConsole.imageGen}</span>
                      <span className={`font-mono ${settings?.imageGenEnabled ? 'text-emerald-300' : 'text-zinc-400'}`}>
                        {settings?.imageGenEnabled ? t.debugConsole.on : t.debugConsole.off}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">{t.debugConsole.voiceTts}</span>
                      <span className={`font-mono ${settings?.voiceEnabled ? 'text-emerald-300' : 'text-zinc-400'}`}>
                        {settings?.voiceEnabled ? t.debugConsole.on : t.debugConsole.off}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'errors' && (
              <div className="space-y-4">
                {errors.length > 0 ? (
                  <>
                    <div className="sticky top-0 z-10 rounded-xl border border-white/5 bg-zinc-950/90 p-3 backdrop-blur-md">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={18} className="text-rose-300" />
                            <span className="text-sm font-semibold text-white">{filteredErrors.length} {t.debugConsole.errors}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setSeverityFilter('all')}
                              title={t.debugConsole.clear}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                severityFilter === 'all'
                                  ? 'border-white/20 bg-white/10 text-white'
                                  : 'border-white/5 bg-zinc-900/60 text-zinc-400 hover:border-white/20 hover:text-zinc-100'
                              }`}
                            >
                              <X size={14} />
                            </button>
                            <button
                              onClick={() => setSeverityFilter('error')}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                severityFilter === 'error'
                                  ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                                  : 'border-white/5 bg-zinc-900/60 text-zinc-400 hover:border-rose-500/40 hover:text-rose-200'
                              }`}
                            >
                              {t.debugConsole.filterErrors}
                            </button>
                            <button
                              onClick={() => setSeverityFilter('warning')}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                severityFilter === 'warning'
                                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                                  : 'border-white/5 bg-zinc-900/60 text-zinc-400 hover:border-amber-500/40 hover:text-amber-200'
                              }`}
                            >
                              {t.debugConsole.filterWarnings}
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={exportErrorLog}
                            className="flex items-center gap-1.5 rounded-lg border-2 border-transparent bg-purple-500/15 px-3 py-1.5 text-xs font-medium text-purple-200 transition-colors hover:border-purple-500 hover:bg-purple-500/20"
                          >
                            <Download size={14} />
                            {t.debugConsole.exportLog}
                          </button>
                          <button
                            onClick={copyAllErrors}
                            className="flex items-center gap-1.5 rounded-lg border-2 border-transparent bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:border-cyan-500 hover:bg-cyan-500/20"
                          >
                            <Copy size={14} />
                            {t.debugConsole.copyAll}
                          </button>
                          <button
                            onClick={clearAllErrors}
                            className="flex items-center gap-1.5 rounded-lg border-2 border-transparent bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors hover:border-rose-500 hover:bg-rose-500/20"
                          >
                            <Trash2 size={14} />
                            {t.debugConsole.clearAll}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div ref={errorListRef} className="space-y-3">
                      {filteredErrors.map((error) => {
                        const isExpanded = expandedErrors.has(error.id);
                        const severityTone = SEVERITY_STYLES[error.severity] || SEVERITY_STYLES.error;
                        return (
                          <div key={error.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className={`rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${severityTone}`}>
                                    {error.severity}
                                  </span>
                                  <span className="text-xs font-mono text-zinc-500">{formatTime(error.timestamp)}</span>
                                  {error.source !== 'Unknown' && (
                                    <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-mono text-cyan-200">
                                      {error.source}
                                    </span>
                                  )}
                                  {error.occurrences > 1 && (
                                    <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-200">
                                      ×{error.occurrences}
                                    </span>
                                  )}
                                </div>
                                <p className="break-words text-sm text-zinc-200">{error.message}</p>
                                {error.occurrences > 1 && (
                                  <p className="mt-2 text-xs text-zinc-500">{formatFullDate(error.firstSeenAt)} → {formatFullDate(error.lastSeenAt)}</p>
                                )}
                              </div>
                              <button
                                onClick={() => copyError(error)}
                                className="rounded-lg border-2 border-transparent p-2 text-zinc-400 transition-colors hover:border-rose-500 hover:bg-white/5 hover:text-rose-200"
                                title={t.debugConsole.copyError}
                              >
                                <Copy size={16} />
                              </button>
                            </div>

                            {error.stack && (
                              <div className="mt-3 space-y-2">
                                <button
                                  onClick={() => toggleErrorExpanded(error.id)}
                                  className="text-xs font-medium text-cyan-300 transition-colors hover:text-cyan-200"
                                >
                                  {isExpanded ? t.debugConsole.hideStack : t.debugConsole.showStack}
                                </button>
                                {isExpanded && (
                                  <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-800 bg-black/40 p-3">
                                    <pre className="whitespace-pre-wrap break-words text-xs text-zinc-400">{error.stack}</pre>
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
                  <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.04] px-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                      <CheckCircle2 size={30} className="text-emerald-300" />
                    </div>
                    <p className="mt-4 text-lg font-semibold text-white">{t.debugConsole.allStable}</p>
                    <p className="mt-2 max-w-md text-sm text-zinc-500">{t.debugConsole.noErrorsSinceStart}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-white/5 bg-zinc-950/70 px-5 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span>{t.debugConsole.footer}</span>
              <span>{t.debugConsole.view}: {currentView}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
