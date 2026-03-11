/**
 * MetricsRegistry — Catalogs all instrumentation points in the Aria codebase.
 *
 * Lightweight utility that documents what is instrumented, where it lives,
 * and what type of metric it is. Used by the coverage script to produce
 * baseline reports.
 *
 * Metric types:
 *   counter   — monotonically increasing value (e.g. total tokens)
 *   gauge     — point-in-time value that can go up or down (e.g. FPS)
 *   timer     — duration measurement (e.g. response time)
 *   histogram — distribution of values over time (e.g. passion history)
 */

/**
 * @typedef {'counter'|'gauge'|'timer'|'histogram'} MetricType
 *
 * @typedef {Object} InstrumentationPoint
 * @property {string} id          — Unique identifier
 * @property {string} name        — Human-readable name
 * @property {MetricType} type    — Metric type
 * @property {string} file        — Source file (relative to project root)
 * @property {string} category    — Grouping category
 * @property {string} storage     — Where data lives: 'memory'|'localStorage'|'console'|'event'|'ipc'
 * @property {boolean} displayed  — Whether it surfaces in any UI
 * @property {boolean} persisted  — Whether it survives a page reload
 * @property {string} description — What this metric tracks
 */

/** @type {InstrumentationPoint[]} */
export const INSTRUMENTATION_POINTS = [
  // ── Startup Timers ──────────────────────────────────────────────
  {
    id: 'startup.total',
    name: 'Total Init Time',
    type: 'timer',
    file: 'src/App.jsx',
    category: 'startup',
    storage: 'console',
    displayed: false,
    persisted: false,
    description: 'console.time for full app initialization'
  },
  {
    id: 'startup.settings',
    name: 'Settings Load Time',
    type: 'timer',
    file: 'src/App.jsx',
    category: 'startup',
    storage: 'console',
    displayed: false,
    persisted: false,
    description: 'console.time for loading settings from localStorage/IPC'
  },
  {
    id: 'startup.ollama',
    name: 'Ollama Check Time',
    type: 'timer',
    file: 'src/App.jsx',
    category: 'startup',
    storage: 'console',
    displayed: false,
    persisted: false,
    description: 'console.time for Ollama connectivity test'
  },

  // ── Response Metrics ────────────────────────────────────────────
  {
    id: 'response.time',
    name: 'Response Time',
    type: 'timer',
    file: 'src/lib/api.js',
    category: 'response',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Wall-clock time from sendMessage start to response end (ms)'
  },
  {
    id: 'response.tokens',
    name: 'Response Tokens',
    type: 'counter',
    file: 'src/lib/api.js',
    category: 'response',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Token count from Ollama eval_count (fallback: word * 1.3 estimation)'
  },
  {
    id: 'response.promptTokens',
    name: 'Prompt Tokens',
    type: 'counter',
    file: 'src/lib/api.js',
    category: 'response',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Token count from Ollama prompt_eval_count (fallback: estimateTokens)'
  },
  {
    id: 'response.wordCount',
    name: 'Word Count',
    type: 'counter',
    file: 'src/lib/api.js',
    category: 'response',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Whitespace-split word count of AI response'
  },
  {
    id: 'response.wordsPerSecond',
    name: 'Words Per Second',
    type: 'gauge',
    file: 'src/lib/api.js',
    category: 'response',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Throughput: wordCount / (responseTime / 1000)'
  },
  {
    id: 'response.model',
    name: 'Model Name',
    type: 'gauge',
    file: 'src/lib/api.js',
    category: 'response',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Ollama model used for the response'
  },

  // ── Token Estimation ────────────────────────────────────────────
  {
    id: 'tokens.estimate',
    name: 'Token Estimation',
    type: 'gauge',
    file: 'src/lib/api.js',
    category: 'tokens',
    storage: 'memory',
    displayed: false,
    persisted: false,
    description: 'Rough estimation: Math.ceil(text.length / 3.5) — not calibrated'
  },

  // ── Per-Message Stats ───────────────────────────────────────────
  {
    id: 'message.stats',
    name: 'Per-Message Stats Object',
    type: 'counter',
    file: 'src/components/ChatInterface.jsx',
    category: 'response',
    storage: 'memory',
    displayed: false,
    persisted: true,
    description: 'Stats blob {responseTime, tokens, promptTokens, wordCount, wordsPerSecond, model} attached to each assistant message, persisted in session save'
  },

  // ── Passion System ──────────────────────────────────────────────
  {
    id: 'passion.level',
    name: 'Passion Level',
    type: 'gauge',
    file: 'src/lib/PassionManager.js',
    category: 'passion',
    storage: 'localStorage',
    displayed: true,
    persisted: true,
    description: 'Per-session passion level (0-100), one-way ratchet'
  },
  {
    id: 'passion.history',
    name: 'Passion History',
    type: 'histogram',
    file: 'src/lib/PassionManager.js',
    category: 'passion',
    storage: 'localStorage',
    displayed: false,
    persisted: true,
    description: 'Rolling buffer of last 50 passion levels per session'
  },
  {
    id: 'passion.tierTransition',
    name: 'Tier Transition',
    type: 'gauge',
    file: 'src/lib/PassionManager.js',
    category: 'passion',
    storage: 'localStorage',
    displayed: true,
    persisted: true,
    description: 'Detects when passion crosses a tier boundary (e.g. Surface → Aware)'
  },
  {
    id: 'passion.characterMemory',
    name: 'Character Memory',
    type: 'gauge',
    file: 'src/lib/PassionManager.js',
    category: 'passion',
    storage: 'localStorage',
    displayed: false,
    persisted: true,
    description: 'Persistent per-character passion level + recent history (last 25)'
  },
  {
    id: 'passion.scoring',
    name: 'LLM Passion Scoring',
    type: 'gauge',
    file: 'src/lib/api.js',
    category: 'passion',
    storage: 'memory',
    displayed: false,
    persisted: false,
    description: 'Async background LLM call scoring closeness 0-10, with speed multiplier'
  },

  // ── Performance Monitoring ──────────────────────────────────────
  {
    id: 'perf.fps',
    name: 'Frame Rate (FPS)',
    type: 'gauge',
    file: 'src/components/DebugConsole.jsx',
    category: 'performance',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'requestAnimationFrame-based FPS counter, updated every second'
  },
  {
    id: 'perf.memory',
    name: 'JS Heap Memory',
    type: 'gauge',
    file: 'src/components/DebugConsole.jsx',
    category: 'performance',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Chrome-only performance.memory API: used/total/limit in MB'
  },

  // ── Event Logging ───────────────────────────────────────────────
  {
    id: 'events.log',
    name: 'Event Log',
    type: 'counter',
    file: 'src/App.jsx',
    category: 'events',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Rolling 10-entry event log: api, passion, settings events'
  },

  // ── Error Collection ────────────────────────────────────────────
  {
    id: 'errors.collection',
    name: 'Error Collection',
    type: 'counter',
    file: 'src/components/DebugConsole.jsx',
    category: 'errors',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Captures console.error, console.warn, unhandledrejection, window.error (max 75)'
  },

  // ── Custom Event Bridge ─────────────────────────────────────────
  {
    id: 'bridge.apiStats',
    name: 'API Stats Event Bridge',
    type: 'gauge',
    file: 'src/components/ChatInterface.jsx',
    category: 'bridge',
    storage: 'event',
    displayed: false,
    persisted: false,
    description: 'CustomEvent "aria-api-stats" dispatched on window, consumed by App.jsx'
  },

  // ── Chat Export Stats ───────────────────────────────────────────
  {
    id: 'export.stats',
    name: 'Chat Export Metadata',
    type: 'counter',
    file: 'src/components/ChatInterface.jsx',
    category: 'export',
    storage: 'memory',
    displayed: false,
    persisted: false,
    description: 'Export includes passionLevel, passionTier, passionSpeed, passionHistory, unchainedMode'
  },

  // ── Command Handler Summary ─────────────────────────────────────
  {
    id: 'command.summary',
    name: '/summary Aggregation',
    type: 'counter',
    file: 'src/lib/commandHandler.js',
    category: 'aggregation',
    storage: 'memory',
    displayed: true,
    persisted: false,
    description: 'Aggregates per-message stats: total tokens, prompt tokens, avg response time, message count'
  },

  // ── Main Process ────────────────────────────────────────────────
  {
    id: 'main.totalTokens',
    name: 'Main Process Token Count',
    type: 'counter',
    file: 'main.js',
    category: 'response',
    storage: 'ipc',
    displayed: false,
    persisted: false,
    description: 'eval_count passed back from main process Ollama response'
  }
];

/** All known categories */
export const CATEGORIES = [...new Set(INSTRUMENTATION_POINTS.map(p => p.category))];

/** All known metric types */
export const METRIC_TYPES = ['counter', 'gauge', 'timer', 'histogram'];

/**
 * Known instrumentation gaps — areas with no or insufficient coverage.
 * @type {Array<{id: string, category: string, description: string, severity: 'high'|'medium'|'low'}>}
 */
export const KNOWN_GAPS = [
  {
    id: 'gap.no-centralized-aggregation',
    category: 'architecture',
    description: 'No centralized metrics aggregation layer — stats are scattered across components (App.jsx state, DebugConsole, ChatInterface event, commandHandler)',
    severity: 'high'
  },
  {
    id: 'gap.no-session-summaries',
    category: 'aggregation',
    description: 'No session-level stats summaries (avg response time, total tokens per session, messages per session). Only /summary command aggregates on-demand from message history.',
    severity: 'high'
  },
  {
    id: 'gap.no-persistent-history',
    category: 'persistence',
    description: 'Response metrics (timing, tokens, WPS) are lost on page reload. Only passion data persists in localStorage. No historical trends available.',
    severity: 'high'
  },
  {
    id: 'gap.no-lifecycle-events',
    category: 'events',
    description: 'No tracking for chat lifecycle events: create, delete, switch character, session restore. Event log only captures api/passion/settings.',
    severity: 'medium'
  },
  {
    id: 'gap.no-model-switch-tracking',
    category: 'events',
    description: 'No tracking of model switch frequency or history. autoDetectAndSetModel runs silently.',
    severity: 'medium'
  },
  {
    id: 'gap.no-error-trending',
    category: 'errors',
    description: 'Errors are collected but no rate trending, categorization, or historical analysis. Buffer resets on reload.',
    severity: 'medium'
  },
  {
    id: 'gap.token-estimation-uncalibrated',
    category: 'tokens',
    description: 'estimateTokens() uses text.length/3.5 — a rough heuristic not calibrated against actual Ollama tokenization.',
    severity: 'low'
  },
  {
    id: 'gap.no-suggestion-metrics',
    category: 'features',
    description: 'Smart suggestions generation has no timing, success rate, or fallback rate tracking.',
    severity: 'low'
  },
  {
    id: 'gap.no-image-gen-metrics',
    category: 'features',
    description: 'Image generation (AUTOMATIC1111) has no timing, success rate, or usage frequency tracking.',
    severity: 'low'
  },
  {
    id: 'gap.no-voice-metrics',
    category: 'features',
    description: 'Voice/TTS (Piper) has no timing, success rate, or usage tracking.',
    severity: 'low'
  },
  {
    id: 'gap.startup-timers-console-only',
    category: 'startup',
    description: 'Startup timers use console.time/timeEnd — output goes to dev console only, not captured for analysis.',
    severity: 'low'
  },
  {
    id: 'gap.event-log-volatile',
    category: 'events',
    description: 'Event log is a 10-entry in-memory rolling buffer — no persistence, no export, no filtering beyond DebugConsole UI.',
    severity: 'low'
  }
];
