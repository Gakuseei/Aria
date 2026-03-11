════════════════════════════════════════════════════════════════════════
  ARIA METRICS COVERAGE REPORT
  Generated: 2026-03-11T02:29:21.926Z
════════════════════════════════════════════════════════════════════════

## Summary
  Files scanned:              41
  Files with instrumentation: 11
  Total instrumentation hits: 276

## By Metric Type
  counter        33 hits
  gauge         214 hits
  timer          29 hits

## By Pattern
────────────────────────────────────────────────────────────────────────
  console.time/timeEnd           [timer    ]    6 hits in 1 file(s)
  Response timing                [timer    ]   23 hits in 5 file(s)
  Ollama token counts            [counter  ]    7 hits in 2 file(s)
  Token estimation               [gauge    ]    3 hits in 1 file(s)
  Words per second               [gauge    ]   44 hits in 4 file(s)
  Passion tracking               [gauge    ]  118 hits in 9 file(s)
  FPS monitoring                 [gauge    ]   22 hits in 2 file(s)
  Memory monitoring              [gauge    ]    4 hits in 1 file(s)
  Event logging                  [counter  ]   11 hits in 2 file(s)
  API stats callback/event       [gauge    ]    7 hits in 3 file(s)
  Error capture                  [counter  ]    9 hits in 1 file(s)
  Stats object usage             [counter  ]    6 hits in 3 file(s)
  CustomEvent dispatch           [gauge    ]    5 hits in 2 file(s)
  localStorage metrics persistence [gauge    ]   11 hits in 2 file(s)

## Instrumented Files
────────────────────────────────────────────────────────────────────────
  src/lib/translations.js
    66 hits — patterns: response-time, words-per-sec, passion-level, fps-monitor
  src/components/ChatInterface.jsx
    59 hits — patterns: passion-level, api-stats, stats-object, custom-event, localstorage-metrics
  src/lib/api.js
    38 hits — patterns: response-time, eval-count, estimate-tokens, words-per-sec, passion-level, api-stats, stats-object
  src/components/DebugConsole.jsx
    31 hits — patterns: response-time, words-per-sec, fps-monitor, memory-monitor, event-log, error-capture
  src/lib/PassionManager.js
    28 hits — patterns: passion-level, localstorage-metrics
  src/App.jsx
    26 hits — patterns: console-timer, response-time, words-per-sec, passion-level, event-log, api-stats
  src/lib/StoryEngine.js
    11 hits — patterns: passion-level
  src/lib/commandHandler.js
    7 hits — patterns: response-time, passion-level, stats-object
  src/components/CharacterCreator.jsx
    4 hits — patterns: custom-event
  main.js
    3 hits — patterns: eval-count, passion-level
  src/components/LoadGame.jsx
    3 hits — patterns: passion-level

## Known Gaps
────────────────────────────────────────────────────────────────────────
  [HIGH]
    - No centralized metrics aggregation layer
    - No session-level stats summaries (avg response time, total tokens per session)
    - Response metrics lost on page reload — only passion persists
  [MEDIUM]
    - No tracking for chat lifecycle events (create/delete/switch)
    - No model switch frequency tracking
    - No error rate trending or historical analysis
  [LOW]
    - estimateTokens() uses text.length/3.5 — not calibrated
    - Smart suggestions: no timing or success rate tracking
    - Image generation: no timing or usage tracking
    - Voice/TTS: no timing or usage tracking
    - Startup timers go to console only — not captured for analysis
    - Event log: 10-entry in-memory buffer, no persistence or export

## Coverage Score
  Active patterns: 14/14 (100%)
  Known gaps:      12 (3 high, 3 medium, 6 low)

════════════════════════════════════════════════════════════════════════
