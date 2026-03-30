const CIRCULAR_REF_LABEL = '[Circular]';
const HIDDEN_STORAGE_KEYS = new Set([
  'isSupporter',
  'passionGatekeepingEnabled',
  'chatFontSize',
  'storyFontSize',
  'settings',
]);

export const DEBUG_CONSOLE_ERROR_LIMIT = 75;
export const DEBUG_CONSOLE_EVENT_LIMIT = 50;

function createJsonReplacer() {
  const seen = new WeakSet();

  return (_key, value) => {
    if (typeof value === 'bigint') {
      return `${value}n`;
    }

    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`;
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack || '',
      };
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value)) {
      return CIRCULAR_REF_LABEL;
    }

    seen.add(value);
    return value;
  };
}

export function safeSerialize(value, spacing = 2) {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value, createJsonReplacer(), spacing);
  } catch (error) {
    return `[Unserializable: ${error.message}]`;
  }
}

export function formatConsoleArgs(args) {
  return args.map((arg) => safeSerialize(arg, 2)).join(' ');
}

export function extractSourceFromStack(stack) {
  if (!stack) return 'Unknown';

  const lines = String(stack).split('\n');
  for (const line of lines) {
    const match = line.match(/at\s+(?:.*\s+)?\(?(.+?):(\d+):(\d+)\)?/);
    if (!match) continue;

    const [, file, lineNumber] = match;
    const fileName = file.split('/').pop().split('\\').pop();
    return `${fileName}:${lineNumber}`;
  }

  return 'Unknown';
}

export function createCapturedError({
  id,
  severity = 'error',
  message,
  stack = '',
  source = 'Unknown',
  timestamp = Date.now(),
}) {
  const normalizedMessage = typeof message === 'string' ? message : safeSerialize(message, 2);
  const normalizedStack = typeof stack === 'string' ? stack : safeSerialize(stack, 2);
  const normalizedSource = source || extractSourceFromStack(normalizedStack);

  return {
    id,
    severity,
    message: normalizedMessage,
    stack: normalizedStack,
    source: normalizedSource,
    timestamp,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    occurrences: 1,
  };
}

export function getErrorSignature(error) {
  const stackHead = String(error.stack || '').split('\n').slice(0, 3).join('\n');
  return [error.severity, error.source, error.message, stackHead].join('|');
}

export function appendCapturedError(existingErrors, nextError, options = {}) {
  const {
    dedupeWindowMs = 1500,
    limit = DEBUG_CONSOLE_ERROR_LIMIT,
  } = options;

  const incoming = {
    ...nextError,
    firstSeenAt: nextError.firstSeenAt || nextError.timestamp,
    lastSeenAt: nextError.lastSeenAt || nextError.timestamp,
    occurrences: nextError.occurrences || 1,
  };

  const signature = getErrorSignature(incoming);
  const duplicateIndex = existingErrors.findIndex((entry) => {
    if (getErrorSignature(entry) !== signature) {
      return false;
    }

    return Math.abs(incoming.timestamp - (entry.lastSeenAt || entry.timestamp)) <= dedupeWindowMs;
  });

  if (duplicateIndex >= 0) {
    const updated = [...existingErrors];
    const duplicate = updated[duplicateIndex];
    updated[duplicateIndex] = {
      ...duplicate,
      lastSeenAt: incoming.timestamp,
      timestamp: incoming.timestamp,
      occurrences: (duplicate.occurrences || 1) + 1,
    };
    return updated;
  }

  return [incoming, ...existingErrors].slice(0, limit);
}

export function collectStorageSnapshot(storageLike) {
  if (!storageLike || typeof storageLike.length !== 'number' || typeof storageLike.key !== 'function') {
    return [];
  }

  const entries = [];

  for (let index = 0; index < storageLike.length; index += 1) {
    const key = storageLike.key(index);
    if (!key || HIDDEN_STORAGE_KEYS.has(key)) {
      continue;
    }

    let value;
    try {
      const rawValue = storageLike.getItem(key);
      try {
        value = JSON.parse(rawValue);
      } catch {
        value = rawValue;
      }
    } catch {
      value = '<error reading>';
    }

    entries.push({
      key,
      value,
      preview: typeof value === 'string' ? value : safeSerialize(value, 2),
      kind: Array.isArray(value) ? 'array' : typeof value,
    });
  }

  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

export function summarizeDebugHealth({
  errors = [],
  eventLog = [],
  lastApiResponseTime = null,
  lastApiWps = null,
}) {
  const recentErrors = errors.filter((entry) => entry.severity === 'error').length;
  const recentWarnings = errors.filter((entry) => entry.severity === 'warning').length;

  let apiStatus = 'idle';
  if (typeof lastApiResponseTime === 'number') {
    if (lastApiResponseTime < 500) {
      apiStatus = 'healthy';
    } else if (lastApiResponseTime < 2000) {
      apiStatus = 'slow';
    } else {
      apiStatus = 'degraded';
    }
  }

  return {
    overallStatus: recentErrors > 0 ? 'attention' : recentWarnings > 0 ? 'warning' : 'healthy',
    recentErrors,
    recentWarnings,
    recentEvents: eventLog.length,
    apiStatus,
    apiResponseTime: lastApiResponseTime,
    apiThroughput: lastApiWps,
  };
}

export function buildErrorExportPayload({
  appVersion,
  errors,
  eventLog,
  settings,
  currentView,
  healthSummary,
  platform,
  exportedAt = new Date().toISOString(),
}) {
  return {
    exportedAt,
    appVersion,
    platform,
    currentView,
    healthSummary,
    errors: errors.map(({ id, ...entry }) => entry),
    eventLog,
    settingsSnapshot: settings,
  };
}
