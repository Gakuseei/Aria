#!/usr/bin/env node

/**
 * Metrics Coverage Analyzer
 *
 * Scans the Aria codebase for instrumentation patterns and cross-references
 * them against the MetricsRegistry to produce a coverage summary.
 *
 * Usage: node scripts/metrics-coverage.js [--json]
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ── Pattern Definitions ───────────────────────────────────────────

const INSTRUMENTATION_PATTERNS = [
  { id: 'console-timer',   regex: /console\.time(?:End)?\s*\(/g,                    type: 'timer',     label: 'console.time/timeEnd' },
  { id: 'response-time',   regex: /responseTime|response_time|endTime\s*-\s*startTime/g, type: 'timer', label: 'Response timing' },
  { id: 'eval-count',      regex: /eval_count|prompt_eval_count/g,                  type: 'counter',   label: 'Ollama token counts' },
  { id: 'estimate-tokens', regex: /estimateTokens/g,                                type: 'gauge',     label: 'Token estimation' },
  { id: 'words-per-sec',   regex: /wordsPerSecond|wps|WPS/gi,                       type: 'gauge',     label: 'Words per second' },
  { id: 'passion-level',   regex: /passionLevel|passionManager\.\w+|applyScore|trackHistory|getPassionLevel/g, type: 'gauge', label: 'Passion tracking' },
  { id: 'fps-monitor',     regex: /\bfps\b|frameRate|requestAnimationFrame.*measure/gi, type: 'gauge',  label: 'FPS monitoring' },
  { id: 'memory-monitor',  regex: /performance\.memory/g,                           type: 'gauge',     label: 'Memory monitoring' },
  { id: 'event-log',       regex: /addEventToLog|eventLog/g,                        type: 'counter',   label: 'Event logging' },
  { id: 'api-stats',       regex: /onApiStats|aria-api-stats/g,                     type: 'gauge',     label: 'API stats callback/event' },
  { id: 'error-capture',   regex: /captureError|console\.error\s*=|unhandledrejection/g, type: 'counter', label: 'Error capture' },
  { id: 'stats-object',    regex: /stats:\s*\{|\.stats\s*&&|\.stats\./g,            type: 'counter',   label: 'Stats object usage' },
  { id: 'custom-event',    regex: /new\s+CustomEvent/g,                             type: 'gauge',     label: 'CustomEvent dispatch' },
  { id: 'localstorage-metrics', regex: /PASSION_STORAGE_KEY|PASSION_MEMORY_KEY|localStorage\.\w+Item.*passion/gi, type: 'gauge', label: 'localStorage metrics persistence' }
];

// ── File Scanner ──────────────────────────────────────────────────

function collectSourceFiles(dir, extensions = ['.js', '.jsx', '.mjs']) {
  const files = [];
  const skipDirs = new Set(['node_modules', 'dist', 'build', '.git', '.claude', 'tools', '.nexus-worktrees']);
  const skipFiles = new Set(['metricsRegistry.js', 'metrics-coverage.js']);

  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(join(d, entry.name));
      } else if (extensions.some(ext => entry.name.endsWith(ext)) && !skipFiles.has(entry.name)) {
        files.push(join(d, entry.name));
      }
    }
  }

  walk(dir);
  return files;
}

// ── Main Analysis ─────────────────────────────────────────────────

function analyze() {
  const sourceFiles = collectSourceFiles(PROJECT_ROOT);
  const results = {
    scannedFiles: sourceFiles.length,
    instrumentationByFile: {},
    patternSummary: {},
    typeSummary: { counter: 0, gauge: 0, timer: 0, histogram: 0 },
    totalHits: 0
  };

  // Init pattern summary
  for (const p of INSTRUMENTATION_PATTERNS) {
    results.patternSummary[p.id] = { label: p.label, type: p.type, hits: 0, files: [] };
  }

  for (const filePath of sourceFiles) {
    const relPath = relative(PROJECT_ROOT, filePath);
    let content;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const fileHits = [];

    for (const pattern of INSTRUMENTATION_PATTERNS) {
      // Reset regex lastIndex
      pattern.regex.lastIndex = 0;
      const matches = content.match(pattern.regex);
      if (matches && matches.length > 0) {
        fileHits.push({ pattern: pattern.id, type: pattern.type, count: matches.length });
        results.patternSummary[pattern.id].hits += matches.length;
        results.patternSummary[pattern.id].files.push(relPath);
        results.typeSummary[pattern.type] = (results.typeSummary[pattern.type] || 0) + matches.length;
        results.totalHits += matches.length;
      }
    }

    if (fileHits.length > 0) {
      results.instrumentationByFile[relPath] = fileHits;
    }
  }

  return results;
}

// ── Known Gaps (mirrors metricsRegistry.js) ───────────────────────

const KNOWN_GAPS = [
  { id: 'gap.no-centralized-aggregation', severity: 'high', description: 'No centralized metrics aggregation layer' },
  { id: 'gap.no-session-summaries',       severity: 'high', description: 'No session-level stats summaries (avg response time, total tokens per session)' },
  { id: 'gap.no-persistent-history',      severity: 'high', description: 'Response metrics lost on page reload — only passion persists' },
  { id: 'gap.no-lifecycle-events',        severity: 'medium', description: 'No tracking for chat lifecycle events (create/delete/switch)' },
  { id: 'gap.no-model-switch-tracking',   severity: 'medium', description: 'No model switch frequency tracking' },
  { id: 'gap.no-error-trending',          severity: 'medium', description: 'No error rate trending or historical analysis' },
  { id: 'gap.token-estimation-uncalibrated', severity: 'low', description: 'estimateTokens() uses text.length/3.5 — not calibrated' },
  { id: 'gap.no-suggestion-metrics',      severity: 'low', description: 'Smart suggestions: no timing or success rate tracking' },
  { id: 'gap.no-image-gen-metrics',       severity: 'low', description: 'Image generation: no timing or usage tracking' },
  { id: 'gap.no-voice-metrics',           severity: 'low', description: 'Voice/TTS: no timing or usage tracking' },
  { id: 'gap.startup-timers-console-only', severity: 'low', description: 'Startup timers go to console only — not captured for analysis' },
  { id: 'gap.event-log-volatile',         severity: 'low', description: 'Event log: 10-entry in-memory buffer, no persistence or export' }
];

// ── Output Formatting ─────────────────────────────────────────────

function formatReport(results) {
  const lines = [];
  const bar = '═'.repeat(72);
  const thin = '─'.repeat(72);

  lines.push(bar);
  lines.push('  ARIA METRICS COVERAGE REPORT');
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push(bar);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push(`  Files scanned:              ${results.scannedFiles}`);
  lines.push(`  Files with instrumentation: ${Object.keys(results.instrumentationByFile).length}`);
  lines.push(`  Total instrumentation hits: ${results.totalHits}`);
  lines.push('');

  // By type
  lines.push('## By Metric Type');
  for (const [type, count] of Object.entries(results.typeSummary)) {
    if (count > 0) {
      lines.push(`  ${type.padEnd(12)} ${String(count).padStart(4)} hits`);
    }
  }
  lines.push('');

  // By pattern
  lines.push('## By Pattern');
  lines.push(thin);
  for (const [id, data] of Object.entries(results.patternSummary)) {
    if (data.hits > 0) {
      lines.push(`  ${data.label.padEnd(30)} [${data.type.padEnd(9)}]  ${String(data.hits).padStart(3)} hits in ${data.files.length} file(s)`);
    }
  }
  lines.push('');

  // By file
  lines.push('## Instrumented Files');
  lines.push(thin);
  const sorted = Object.entries(results.instrumentationByFile)
    .sort((a, b) => b[1].reduce((s, h) => s + h.count, 0) - a[1].reduce((s, h) => s + h.count, 0));
  for (const [file, hits] of sorted) {
    const total = hits.reduce((s, h) => s + h.count, 0);
    const patterns = hits.map(h => h.pattern).join(', ');
    lines.push(`  ${file}`);
    lines.push(`    ${total} hits — patterns: ${patterns}`);
  }
  lines.push('');

  // Gaps
  lines.push('## Known Gaps');
  lines.push(thin);
  const bySeverity = { high: [], medium: [], low: [] };
  for (const gap of KNOWN_GAPS) {
    bySeverity[gap.severity].push(gap);
  }
  for (const sev of ['high', 'medium', 'low']) {
    if (bySeverity[sev].length > 0) {
      lines.push(`  [${sev.toUpperCase()}]`);
      for (const g of bySeverity[sev]) {
        lines.push(`    - ${g.description}`);
      }
    }
  }
  lines.push('');

  // Coverage score
  const instrumentedCategories = new Set();
  for (const data of Object.values(results.patternSummary)) {
    if (data.hits > 0) instrumentedCategories.add(data.type);
  }
  const totalPatterns = INSTRUMENTATION_PATTERNS.length;
  const activePatterns = Object.values(results.patternSummary).filter(d => d.hits > 0).length;
  const coveragePercent = Math.round((activePatterns / totalPatterns) * 100);

  lines.push('## Coverage Score');
  lines.push(`  Active patterns: ${activePatterns}/${totalPatterns} (${coveragePercent}%)`);
  lines.push(`  Known gaps:      ${KNOWN_GAPS.length} (${bySeverity.high.length} high, ${bySeverity.medium.length} medium, ${bySeverity.low.length} low)`);
  lines.push('');
  lines.push(bar);

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────

const jsonMode = process.argv.includes('--json');
const results = analyze();

if (jsonMode) {
  console.log(JSON.stringify({ ...results, knownGaps: KNOWN_GAPS }, null, 2));
} else {
  console.log(formatReport(results));
}
