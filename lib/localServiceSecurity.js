const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);
const LOOPBACK_HTTP_HOSTS = Object.freeze(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_CONNECT_SRC_HOSTS = Object.freeze(['localhost', '127.0.0.1']);
const CONNECT_SRC_PROTOCOL_ALIASES = Object.freeze({
  'http:': ['http:', 'ws:'],
  'https:': ['https:', 'wss:'],
});
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

const LOCAL_SERVICE_DEFAULTS = Object.freeze({
  ollama: ['http://127.0.0.1:11434'],
  imageGen: ['http://127.0.0.1:7860'],
  voice: ['http://127.0.0.1:5000'],
  zonos: ['http://127.0.0.1:7860'],
});

const LOCAL_SERVICE_SETTING_KEYS = Object.freeze({
  ollama: ['ollamaUrl'],
  imageGen: ['imageGenUrl'],
  voice: ['voiceUrl'],
  zonos: [],
});

function stripOuterQuotes(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '').trim() : '';
}

function parseSafeHttpUrl(rawUrl, { protocols = ['http:', 'https:'] } = {}) {
  const candidate = stripOuterQuotes(rawUrl);
  if (!candidate || CONTROL_CHAR_REGEX.test(candidate)) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (!protocols.includes(parsed.protocol)) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '');

  return LOOPBACK_HOSTNAMES.has(normalized);
}

function getNormalizedPort(parsed) {
  if (parsed.port) {
    return parsed.port;
  }

  return parsed.protocol === 'https:' ? '443' : '80';
}

function getLoopbackServiceIdentity(parsed) {
  return `${parsed.protocol}//loopback:${getNormalizedPort(parsed)}`;
}

function parseLoopbackUrl(rawUrl, { protocols = ['http:', 'https:'], allowPath = false } = {}) {
  const parsed = parseSafeHttpUrl(rawUrl, { protocols });
  if (!parsed || !isLoopbackHostname(parsed.hostname)) {
    return null;
  }

  if (!allowPath && parsed.pathname && parsed.pathname !== '/') {
    return null;
  }

  if (parsed.search || parsed.hash) {
    return null;
  }

  return parsed;
}

function getTrustedServiceBaseUrls(service, settings = {}) {
  const settingKeys = LOCAL_SERVICE_SETTING_KEYS[service] || [];
  const configured = settingKeys
    .map((key) => settings?.[key])
    .filter((value) => typeof value === 'string' && value.trim());

  if (configured.length > 0) {
    return [...new Set(configured)];
  }

  const defaults = LOCAL_SERVICE_DEFAULTS[service] || [];
  return [...new Set(defaults)];
}

function getTrustedLoopbackOriginsForService(service, settings = {}) {
  return [...new Set(
    getTrustedServiceBaseUrls(service, settings)
      .map((candidate) => parseLoopbackUrl(candidate))
      .filter(Boolean)
      .map((parsed) => parsed.origin)
  )];
}

function expandLoopbackOrigins(parsed, hosts = [], protocols = []) {
  const port = getNormalizedPort(parsed);
  return protocols.flatMap((protocol) => hosts.map((host) => `${protocol}//${host}:${port}`));
}

function getLoopbackHttpOrigins(parsed) {
  return expandLoopbackOrigins(parsed, LOOPBACK_HTTP_HOSTS, [parsed?.protocol].filter(Boolean));
}

function getLoopbackConnectSrcOrigins(parsed) {
  const protocols = CONNECT_SRC_PROTOCOL_ALIASES[parsed?.protocol] || [parsed?.protocol].filter(Boolean);
  return expandLoopbackOrigins(parsed, LOOPBACK_CONNECT_SRC_HOSTS, protocols);
}

function getTrustedLoopbackHttpOrigins(rawUrls = []) {
  return [...new Set(
    rawUrls
      .map((candidate) => parseLoopbackUrl(candidate))
      .filter(Boolean)
      .flatMap((parsed) => getLoopbackHttpOrigins(parsed))
  )];
}

function getTrustedLoopbackHttpOriginsForService(service, settings = {}) {
  return getTrustedLoopbackHttpOrigins(getTrustedServiceBaseUrls(service, settings));
}

function getTrustedLoopbackConnectSrcOrigins(rawUrls = []) {
  return [...new Set(
    rawUrls
      .map((candidate) => parseLoopbackUrl(candidate))
      .filter(Boolean)
      .flatMap((parsed) => getLoopbackConnectSrcOrigins(parsed))
  )];
}

function getTrustedLoopbackConnectSrcOriginsForService(service, settings = {}) {
  return getTrustedLoopbackConnectSrcOrigins(getTrustedServiceBaseUrls(service, settings));
}

function validateLocalServiceUrl(service, rawUrl, settings = {}, { protocols = ['http:', 'https:'], allowPath = false, extraUrls = [] } = {}) {
  const parsed = parseLoopbackUrl(rawUrl, { protocols, allowPath });
  if (!parsed) {
    return null;
  }

  const trustedCandidates = [...getTrustedServiceBaseUrls(service, settings), ...extraUrls]
    .map((candidate) => parseLoopbackUrl(candidate, { protocols, allowPath: false }))
    .filter(Boolean);

  const targetIdentity = getLoopbackServiceIdentity(parsed);
  return trustedCandidates.some((candidate) => getLoopbackServiceIdentity(candidate) === targetIdentity)
    ? parsed
    : null;
}

module.exports = {
  CONTROL_CHAR_REGEX,
  LOCAL_SERVICE_DEFAULTS,
  getLoopbackServiceIdentity,
  getTrustedLoopbackConnectSrcOrigins,
  getTrustedLoopbackConnectSrcOriginsForService,
  getTrustedLoopbackHttpOrigins,
  getTrustedLoopbackHttpOriginsForService,
  getTrustedLoopbackOriginsForService,
  getTrustedServiceBaseUrls,
  isLoopbackHostname,
  parseLoopbackUrl,
  parseSafeHttpUrl,
  validateLocalServiceUrl,
};
