import { APP_VERSION, APP_NAME } from './appMeta.js';

export const APP_EXPORT_SCHEMA = 'aria.export.v2';
export const SCHEMA_VERSION = 2;

const SUPPORTED_KINDS = new Set(['chat', 'character', 'story', 'diagnostics']);

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...['COM', 'LPT'].flatMap((prefix) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${prefix}${n}`)),
]);

export function buildEnvelope(kind, payload) {
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(`Unsupported export kind: ${kind}`);
  }
  if (payload === null || payload === undefined || Array.isArray(payload) || typeof payload !== 'object') {
    throw new TypeError('payload must be a non-null object');
  }
  return {
    $schema: APP_EXPORT_SCHEMA,
    kind,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: APP_NAME, version: APP_VERSION },
    payload,
  };
}

export function stringifyEnvelope(envelope) {
  return JSON.stringify(envelope, null, 2);
}

export function parseEnvelope(text, expectedKind) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: 'invalidJson', detail: error.message };
  }

  if (!raw || typeof raw !== 'object' || raw.$schema !== APP_EXPORT_SCHEMA) {
    return { ok: false, reason: 'notAriaExport' };
  }

  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupportedSchema', detail: String(raw.schemaVersion) };
  }

  if (expectedKind && raw.kind !== expectedKind) {
    return { ok: false, reason: 'wrongKind', detail: String(raw.kind ?? 'unknown') };
  }

  if (raw.payload === null || raw.payload === undefined || Array.isArray(raw.payload) || typeof raw.payload !== 'object') {
    return { ok: false, reason: 'missingPayload' };
  }

  return { ok: true, envelope: raw };
}

export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return '';
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  if (!cleaned) return '';
  return WINDOWS_RESERVED_NAMES.has(cleaned.toUpperCase()) ? `_${cleaned}` : cleaned;
}

function compactTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `-${pad3(date.getMilliseconds())}`
  );
}

export function buildExportFilename(kind, name) {
  const safeName = sanitizeFilename(name);
  const stamp = compactTimestamp();
  return safeName
    ? `aria-${kind}-${safeName}-${stamp}.json`
    : `aria-${kind}-${stamp}.json`;
}
