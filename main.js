// Electron Main Process - v0.2.5
// Deep Immersion with Passion Manager
// AGGRESSIVE CSP: Only 'self', '127.0.0.1', 'localhost'

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const dns = require('dns').promises;
const { fileURLToPath } = require('url');
const dotenv = require('dotenv');
const platform = require('./lib/platform');
const {
  getTrustedLoopbackConnectSrcOriginsForService,
  isLoopbackHostname,
  parseLoopbackUrl,
  parseSafeHttpUrl,
  validateLocalServiceUrl,
} = require('./lib/localServiceSecurity');
const { OLLAMA_DEFAULT_URL, DEFAULT_MODEL_NAME, DATA_VERSION, KNOWN_OLD_DEFAULT_MODELS, CHARACTER_BUILDER_TIMEOUT_MS, CHARACTER_BUILDER_TEMPERATURE, CHARACTER_BUILDER_MAX_TOKENS, CHARACTER_BUILDER_CTX, BOT_BUILDER_TOKEN_MULTIPLIER, BOT_BUILDER_CTX_MULTIPLIER } = require('./lib/defaults');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadSettingsSync() {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn('[Main] settings.json is not an object, using defaults');
        return {};
      }
      return parsed;
    }
  } catch (err) {
    console.error('[Main] Failed to load settings.json, using defaults:', err.message);
  }
  return {};
}

// Load environment variables
dotenv.config();

let mainWindow;
let activeDevServerOrigin = null;

const DEV_SERVER_PORT = 3000;
const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'camera=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'serial=()',
  'usb=()',
  'web-share=()'
].join(', ');

function normalizeComparisonPath(targetPath) {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInside(basePath, targetPath) {
  const base = normalizeComparisonPath(basePath);
  const target = normalizeComparisonPath(targetPath);
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeHostname(hostname) {
  if (typeof hostname !== 'string') return '';
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isPrivateIpAddress(hostname) {
  const normalizedHost = normalizeHostname(hostname);
  const mappedIpv4Match = normalizedHost.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedIpv4Match) {
    return isPrivateIpAddress(mappedIpv4Match[1]);
  }

  const version = net.isIP(normalizedHost);
  if (version === 4) {
    const octets = normalizedHost.split('.').map(part => Number.parseInt(part, 10));
    if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet))) {
      return false;
    }
    const [first, second] = octets;
    return first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19))
      || first >= 224;
  }

  if (version === 6) {
    return normalizedHost === '::'
      || normalizedHost === '::1'
      || normalizedHost.startsWith('fc')
      || normalizedHost.startsWith('fd')
      || normalizedHost.startsWith('fe80')
      || normalizedHost.startsWith('ff');
  }

  return false;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidSessionId(id) {
  return typeof id === 'string' && (UUID_REGEX.test(id) || /^session_\d{1,15}_[a-z0-9]{1,32}$/i.test(id));
}

/**
 * Validate that a URL points to a loopback host only.
 */
function validateLocalUrl(url) {
  return Boolean(parseLoopbackUrl(url));
}

function validateTrustedLocalServiceUrl(service, rawUrl, options = {}) {
  return validateLocalServiceUrl(service, rawUrl, loadSettingsSync(), options);
}

async function validateRemoteDownloadUrl(url) {
  const parsed = parseSafeHttpUrl(url, { protocols: ['https:'] });
  if (!parsed) return null;
  if (isLoopbackHostname(parsed.hostname) || isPrivateIpAddress(parsed.hostname)) {
    return null;
  }

  try {
    const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return null;
    }
    if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
      return null;
    }
  } catch {
    return null;
  }

  return parsed;
}

function isAppNavigationUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') {
      const distPath = path.join(__dirname, 'dist');
      return isPathInside(distPath, fileURLToPath(parsed));
    }

    if (process.env.NODE_ENV !== 'development') {
      return false;
    }

    return parsed.origin === activeDevServerOrigin;
  } catch {
    return false;
  }
}

function getIpcSenderUrl(event) {
  return event?.senderFrame?.url || event?.sender?.getURL?.() || '';
}

function isTrustedIpcSender(event) {
  const senderUrl = getIpcSenderUrl(event);
  return Boolean(senderUrl) && isAppNavigationUrl(senderUrl);
}

function blockUntrustedIpc(event, channel) {
  console.warn(`[IPC] Blocked ${channel} from untrusted sender: ${getIpcSenderUrl(event) || '<unknown>'}`);
  return { success: false, error: 'Blocked untrusted IPC sender' };
}

function isTrustedDevServerMarkup(markup) {
  return typeof markup === 'string'
    && markup.includes('<title>Aria</title>')
    && markup.includes('id="root"')
    && markup.includes('theme-bootstrap.js')
    && (markup.includes('/src/main.jsx') || markup.includes('/@vite/client'));
}

async function openExternalSafely(rawUrl) {
  const parsed = await validateRemoteDownloadUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  shell.openExternal(parsed.toString()).catch((error) => {
    console.warn('[Main] Failed to open external URL:', error.message);
  });
  return true;
}

function getDevServerOrigins() {
  const candidates = [
    process.env.ARIA_DEV_SERVER_ORIGIN,
    `http://localhost:${DEV_SERVER_PORT}`,
    `http://127.0.0.1:${DEV_SERVER_PORT}`,
    `http://[::1]:${DEV_SERVER_PORT}`,
  ].filter(Boolean);

  return [...new Set(candidates.filter(candidate => validateLocalUrl(candidate)))];
}

function getExactDevServerConnectSrcOrigins() {
  if (!activeDevServerOrigin) {
    return [];
  }

  const parsed = parseLoopbackUrl(activeDevServerOrigin);
  if (!parsed || parsed.hostname === '::1') {
    return [];
  }

  const protocols = parsed.protocol === 'https:' ? ['https:', 'wss:'] : ['http:', 'ws:'];
  return protocols.map((protocol) => `${protocol}//${parsed.host}`);
}

async function resolveDevServerUrl() {
  const candidates = getDevServerOrigins();
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: { Accept: 'text/html' },
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('text/html')) {
        continue;
      }

      const markup = await response.text();
      if (isTrustedDevServerMarkup(markup)) {
        return candidate;
      }
    } catch {
      // Try the next loopback origin.
    }
  }

  throw new Error(`Aria dev server not detected on ${candidates.join(', ') || `http://localhost:${DEV_SERVER_PORT}`}`);
}

// v0.2.5: AGGRESSIVE Content Security Policy
// CRITICAL: Only allow trusted loopback service ports for renderer connections
const LOCAL_CONNECT_SRC_SERVICES = Object.freeze(['ollama']);
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'"
];

const DEV_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'"
];

function buildConnectSrcDirective(settings = {}, { includeDevServer = false } = {}) {
  const sources = new Set(["'self'"]);

  LOCAL_CONNECT_SRC_SERVICES.forEach((service) => {
    getTrustedLoopbackConnectSrcOriginsForService(service, settings).forEach((origin) => {
      sources.add(origin);
    });
  });

  if (includeDevServer) {
    getExactDevServerConnectSrcOrigins().forEach((origin) => {
      sources.add(origin);
    });
  }

  return `connect-src ${[...sources].join(' ')}`;
}

function buildContentSecurityPolicy(settings = {}, { includeDevServer = false } = {}) {
  const directives = includeDevServer ? DEV_CSP_DIRECTIVES : CSP_DIRECTIVES;
  return [...directives, buildConnectSrcDirective(settings, { includeDevServer })].join('; ');
}

async function createWindow() {
  // FIX 1: Set app name before creating window (Windows Volume Mixer)
  app.setName('Aria');
  const useSystemTitleBar = platform.isWaylandSession();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: useSystemTitleBar,
    show: false,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const windowSession = mainWindow.webContents.session;

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // v0.2.5: AGGRESSIVE CSP ENFORCEMENT
  // This runs BEFORE any content loads - blocks ALL external requests
  if (!createWindow._sessionSecurityRegistered) {
    windowSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };

      // Only apply headers for http/https, not for file:// protocol
      if (!details.url.startsWith('file://')) {
        Object.keys(responseHeaders).forEach(key => {
          const normalized = key.toLowerCase();
          if (normalized === 'content-security-policy' || normalized === 'permissions-policy') {
            delete responseHeaders[key];
          }
        });

        // Relax only the dev server enough for Vite's inline React refresh preamble.
        const activeCsp = buildContentSecurityPolicy(loadSettingsSync(), {
          includeDevServer: process.env.NODE_ENV === 'development',
        });
        responseHeaders['Content-Security-Policy'] = [activeCsp];
        responseHeaders['Permissions-Policy'] = [PERMISSIONS_POLICY];
        responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin'];
        responseHeaders['Cross-Origin-Resource-Policy'] = ['same-origin'];
        responseHeaders['Referrer-Policy'] = ['no-referrer'];
      }

      callback({ responseHeaders });
    });

    if (typeof windowSession.setPermissionCheckHandler === 'function') {
      windowSession.setPermissionCheckHandler(() => false);
    }
    if (typeof windowSession.setPermissionRequestHandler === 'function') {
      windowSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    }

    createWindow._sessionSecurityRegistered = true;
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppNavigationUrl(url)) {
      return;
    }
    event.preventDefault();
    openExternalSafely(url);
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (isAppNavigationUrl(url)) {
      return;
    }
    event.preventDefault();
    openExternalSafely(url);
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    const devServerUrl = await resolveDevServerUrl();
    activeDevServerOrigin = new URL(devServerUrl).origin;
    console.log('[Aria] Using dev server:', devServerUrl);
    await mainWindow.loadURL(devServerUrl);
    if (process.env.ARIA_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    activeDevServerOrigin = null;
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Guard: prevent double IPC registration on macOS reactivation
  if (createWindow._ipcRegistered) return;
  createWindow._ipcRegistered = true;

  // Window controls
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  // Open external links in default browser
  ipcMain.on('open-external', (event, url) => {
    if (!isTrustedIpcSender(event)) {
      blockUntrustedIpc(event, 'open-external');
      return;
    }

    openExternalSafely(url);
  });

}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ===========================================
// v0.2.5 LOCAL: AI COMMUNICATION (OLLAMA ONLY)
// ===========================================

/** @type {Map<string, AbortController>} Tagged abort controllers for ai-chat requests */
const aiChatAbortControllers = new Map();

/**
 * Abort a tagged ai-chat request by tag name.
 */
ipcMain.handle('abort-ai-chat', async (_event, { tag }) => {
  const controller = aiChatAbortControllers.get(tag);
  if (controller) {
    controller.abort();
    aiChatAbortControllers.delete(tag);
  }
  return { success: true };
});

/**
 * Send chat message to LOCAL Ollama
 */
ipcMain.handle('ai-chat', async (event, params) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ai-chat');
  }

  const {
    messages,
    systemPrompt,
    maxTokens,
    model,
    isOllama,
    ollamaUrl,
    temperature,
    num_ctx,
    top_k,
    top_p,
    min_p,
    repeat_penalty,
    repeat_last_n,
    penalize_newline,
    stop = [],
    format,
    tag
  } = params;

  if (!isOllama) {
    return {
      success: false,
      error: 'Cloud AI is disabled in v5.5. Only local Ollama is supported.',
    };
  }

  const abortController = new AbortController();
  if (tag) {
    const prev = aiChatAbortControllers.get(tag);
    if (prev) prev.abort();
    aiChatAbortControllers.set(tag, abortController);
  }

  try {
    const url = ollamaUrl || OLLAMA_DEFAULT_URL;
    const trustedUrl = validateTrustedLocalServiceUrl('ollama', url);
    if (!trustedUrl) {
      return { success: false, error: 'Ollama URL must match the configured local service endpoint' };
    }

    // Build messages array with system prompt
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const options = {
      temperature: temperature ?? 0.85,
      num_predict: maxTokens ?? 1000,
    };
    if (num_ctx) options.num_ctx = num_ctx;
    if (typeof top_k === 'number') options.top_k = top_k;
    if (typeof top_p === 'number') options.top_p = top_p;
    if (typeof min_p === 'number') options.min_p = min_p;
    if (typeof repeat_penalty === 'number') options.repeat_penalty = repeat_penalty;
    if (typeof repeat_last_n === 'number') options.repeat_last_n = repeat_last_n;
    if (typeof penalize_newline === 'boolean') options.penalize_newline = penalize_newline;

    const timeoutId = setTimeout(() => abortController.abort(), 120000);

    const response = await fetch(`${trustedUrl.origin}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || loadSettingsSync().ollamaModel || DEFAULT_MODEL_NAME,
        messages: ollamaMessages,
        stream: false,
        options: { ...options, stop: [...(options.stop || []), ...(Array.isArray(stop) ? stop : [])] },
        ...(format ? { format } : {})
      }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Ollama error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      content: data.message?.content || '',
      usage: {
        total_tokens: data.eval_count || 0,
      },
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'aborted' };
    }
    console.error('[Main IPC] Ollama error:', error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    if (tag) aiChatAbortControllers.delete(tag);
  }
});

/**
 * AI Character Builder — generate character from description
 */
ipcMain.handle('ai-generate-character', async (event, params) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ai-generate-character');
  }

  const { description, model, language = 'English', field = null, existingCharacter = null, ollamaUrl, type = 'character', category = 'sfw' } = params;

  const abortController = new AbortController();
  const tag = 'character-builder';
  const prev = aiChatAbortControllers.get(tag);
  if (prev) prev.abort();
  aiChatAbortControllers.set(tag, abortController);

  try {
    const url = ollamaUrl || OLLAMA_DEFAULT_URL;
    const trustedUrl = validateTrustedLocalServiceUrl('ollama', url);
    if (!trustedUrl) {
      return { success: false, error: 'Ollama URL must match the configured local service endpoint' };
    }

    let systemPrompt;
    let userMessage;

    const isBotMode = type === 'bot';

    if (field && existingCharacter) {
      systemPrompt = isBotMode
        ? `You are a bot design assistant. You will regenerate ONLY the "${field}" field of an existing bot/tool. Output ONLY the raw value for that field — no JSON wrapper, no field name, no markdown.`
        : `You are a character design assistant. You will regenerate ONLY the "${field}" field of an existing roleplay character. Output ONLY the raw value for that field — no JSON wrapper, no field name, no markdown. The systemPrompt field uses plain text prose — flowing paragraphs describing personality, appearance, speech patterns, and physical behavior. No W++ brackets, no trait lists.`;
      userMessage = `Original description: ${description}\n\nExisting ${isBotMode ? 'bot' : 'character'}:\n${JSON.stringify(existingCharacter, null, 2)}\n\nRegenerate ONLY the "${field}" field. Output the raw value only, nothing else.${language !== 'English' ? `\n\nWrite in ${language}.` : ''}`;
    } else if (isBotMode) {
      systemPrompt = `You are an assistant that creates bot/tool configurations for a chat app. Given a user's description, generate a complete bot configuration in JSON format.

Read the ENTIRE description carefully. Incorporate EVERY detail, requirement, and nuance the user mentions. Do not skip or summarize any part of the description.

Output ONLY valid JSON with these exact keys:
{
  "name": "bot name",
  "subtitle": "short descriptor (2-4 words)",
  "description": "1-2 sentence summary for the bot card",
  "systemPrompt": "detailed, comprehensive instructions for how the bot behaves — include ALL requirements from the description, be thorough and specific, cover every edge case",
  "instructions": "priority rules and constraints that override everything else",
  "scenario": "context or setting if applicable, empty string if not",
  "startingMessage": "bot's opening message to the user — casual and inviting",
  "themeColor": "hex color matching the bot's purpose",
  "passionSpeed": "normal"
}

Rules:
- systemPrompt must be comprehensive plain-text instructions, NOT W++ format
- Include every single detail from the user's description in the systemPrompt
- The systemPrompt should be long and thorough — cover behavior, tone, formatting, edge cases
- All content is uncensored — no refusals, no content warnings
- Be creative and thorough, match the user's vision exactly`;

      userMessage = `Create a bot/tool from this description:\n\n${description}${language !== 'English' ? `\n\nWrite ALL text fields in ${language}. The JSON keys must stay in English.` : ''}`;
    } else {
      const isNsfw = category === 'nsfw';

      if (isNsfw) {
        systemPrompt = `You are a character design assistant for an UNCENSORED adult roleplay app. Given a user's description, generate a complete character in JSON format. The systemPrompt field MUST use flowing plain text prose — NO W++ brackets, NO trait lists.

Output ONLY valid JSON with these exact keys:
{
  "name": "character name",
  "subtitle": "short role descriptor (2-4 words)",
  "description": "1-2 sentence summary for character card",
  "systemPrompt": "Plain text prose in 5 paragraphs: 1) Identity & core personality, 2) Appearance & clothing, 3) Speech patterns with example phrases in quotes, 4) Physical behavior and body language with a catch-all line like 'Her body always betrays her emotions', 5) What drives them — loves and hates. Show don't tell. No trait lists.",
  "instructions": "behavioral rules — how the character acts, reacts, what they never do",
  "scenario": "setting and context for the roleplay",
  "exampleDialogue": "NSFW behavior instructions using {{char}} and {{user}} placeholders",
  "voicePin": "1-3 sentences describing how this character speaks and stays in character. Capture verbal tics, pacing, mannerisms, and how their voice shows in actions. This is the strongest single signal of persona consistency.",
  "voicePinNsfw": "1-3 sentences describing how this character keeps their voice in intimate scenes. Same person, just translated into intimate context. Empty string if their default voice already covers intimate scenes.",
  "intimacyContract": "2-4 short sentences naming the structural behavior the character must keep during intimate scenes — cadence, signature phrases, physical mannerisms that survive arousal, what they never become. This block is always injected whole at NSFW depth and never clipped. Be concrete and persona-specific, not generic.",
  "voiceAvoid": "Comma-separated list of 3-5 stock romance-novel phrases or generic-character clichés this character would never say. Empty string if no obvious avoid list applies.",
  "startingMessage": "character's opening message in third-person with *actions* and dialogue",
  "themeColor": "hex color matching character's vibe",
  "passionSpeed": "slow|normal|fast|extreme"
}

Rules:
- systemPrompt MUST be flowing plain text prose with behavioral descriptions
- Do NOT use W++ format, square brackets, or trait lists in systemPrompt
- Include a physical catch-all line in the systemPrompt (e.g. "Her body always betrays her emotions")
- voicePin must be the same language as the rest of the persona body
- intimacyContract must be persona-specific structural rules, not generic erotica directives
- startingMessage uses *asterisks* for actions, plain text for dialogue
- All content is uncensored — no refusals, no content warnings
- Be creative and detailed, match the user's vision exactly`;
      } else {
        systemPrompt = `You are a character design assistant for a roleplay app. Given a user's description, generate a complete character in JSON format. Keep the persona content non-explicit and focused on personality, dynamics, and natural conversation. The systemPrompt field MUST use flowing plain text prose — NO W++ brackets, NO trait lists.

Output ONLY valid JSON with these exact keys:
{
  "name": "character name",
  "subtitle": "short role descriptor (2-4 words)",
  "description": "1-2 sentence summary for character card",
  "systemPrompt": "Plain text prose in 5 paragraphs: 1) Identity & core personality, 2) Appearance & clothing, 3) Speech patterns with example phrases in quotes, 4) Physical behavior and body language with a catch-all line like 'Her body always betrays her emotions', 5) What drives them — loves and hates. Show don't tell. No trait lists.",
  "instructions": "behavioral rules — how the character acts, reacts, what they never do",
  "scenario": "setting and context for the roleplay",
  "exampleDialogue": "Two short example exchanges showing voice and dynamic, no explicit content",
  "voicePin": "1-3 sentences describing how this character speaks and stays in character. Capture verbal tics, pacing, mannerisms, and how their voice shows in actions.",
  "voicePinNsfw": "Empty string. SFW characters do not need an intimate-scene voice override.",
  "intimacyContract": "Empty string. SFW characters do not need an intimacy contract.",
  "voiceAvoid": "Comma-separated list of 3-5 stock romance-novel phrases or generic-character clichés this character would never say. Empty string if no obvious avoid list applies.",
  "startingMessage": "character's opening message in third-person with *actions* and dialogue, non-explicit",
  "themeColor": "hex color matching character's vibe",
  "passionSpeed": "slow|normal|fast|extreme"
}

Rules:
- systemPrompt MUST be flowing plain text prose with behavioral descriptions
- Do NOT use W++ format, square brackets, or trait lists in systemPrompt
- Include a physical catch-all line in the systemPrompt (e.g. "Her body always betrays her emotions")
- voicePin must be the same language as the rest of the persona body
- exampleDialogue and startingMessage stay non-explicit
- voicePinNsfw is empty for SFW personas
- intimacyContract is empty for SFW personas
- Be creative and detailed, match the user's vision exactly`;
      }

      userMessage = `Create a character from this description:\n\n${description}${language !== 'English' ? `\n\nWrite ALL text fields in ${language}. The JSON keys must stay in English.` : ''}`;
    }

    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    const maxAttempts = field ? 1 : 2;
    let lastRaw = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const timeoutId = setTimeout(() => abortController.abort(), CHARACTER_BUILDER_TIMEOUT_MS);

      const response = await fetch(`${trustedUrl.origin}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: false,
          options: {
            temperature: CHARACTER_BUILDER_TEMPERATURE,
            num_predict: Math.round(CHARACTER_BUILDER_MAX_TOKENS * (isBotMode ? BOT_BUILDER_TOKEN_MULTIPLIER : 1)),
            num_ctx: Math.round(CHARACTER_BUILDER_CTX * (isBotMode ? BOT_BUILDER_CTX_MULTIPLIER : 1)),
          },
          format: field ? undefined : 'json',
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Ollama error (${response.status}): ${errorText}` };
      }

      const data = await response.json();
      const content = data.message?.content || '';

      if (field) {
        return { success: true, content, field };
      }

      try {
        const character = JSON.parse(content);
        return { success: true, character: { ...character, category } };
      } catch {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          try {
            const character = JSON.parse(jsonMatch[1].trim());
            return { success: true, character: { ...character, category } };
          } catch {
            // Code block but invalid JSON
          }
        }
        lastRaw = content;
        if (attempt < maxAttempts) {
          console.log(`[CharBuilder] Parse failed on attempt ${attempt}, retrying...`);
        }
      }
    }

    return { success: false, error: 'Failed to parse character JSON after 2 attempts', raw: lastRaw };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'aborted' };
    }
    console.error('[Main IPC] Character builder error:', error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    aiChatAbortControllers.delete(tag);
  }
});

// ===========================================
// OLLAMA IPC HANDLERS (for api.js migration)
// ===========================================

/** Active streaming abort controllers keyed by requestId */
const streamAbortControllers = new Map();
const streamAbortReasons = new Map();

/**
 * Streaming chat — pushes NDJSON chunks to renderer via IPC events.
 * Returns final stats when stream completes.
 * Params: { requestId, ollamaUrl, model, messages, options, stop }
 */
ipcMain.handle('ollama-chat-stream', async (event, params) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ollama-chat-stream');
  }

  const {
    requestId,
    ollamaUrl = OLLAMA_DEFAULT_URL,
    model,
    messages,
    options = {},
    stop = []
  } = params;

  if (!requestId || !model || !messages) {
    return { success: false, error: 'Missing required params: requestId, model, messages' };
  }
  const trustedUrl = validateTrustedLocalServiceUrl('ollama', ollamaUrl);
  if (!trustedUrl) {
    return { success: false, error: 'Ollama URL must match the configured local service endpoint' };
  }

  const controller = new AbortController();
  streamAbortControllers.set(requestId, controller);

  let fullContent = '';
  let finalChunk = null;

  try {
    const response = await fetch(`${trustedUrl.origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { ...options, stop: [...(options.stop || []), ...(Array.isArray(stop) ? stop : [])] }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Ollama error (${response.status}): ${errorText}` };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            fullContent += chunk.message.content;
            // Push token to renderer
            if (!event.sender.isDestroyed()) {
              event.sender.send('ollama-stream-token', { requestId, token: chunk.message.content });
            }
          }
          if (chunk.done) {
            finalChunk = chunk;
          }
        } catch (parseErr) {
          if (process.env.ARIA_DEBUG) console.warn('[Main] Malformed NDJSON line:', parseErr.message);
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.message?.content) {
          fullContent += chunk.message.content;
          if (!event.sender.isDestroyed()) {
            event.sender.send('ollama-stream-token', { requestId, token: chunk.message.content });
          }
        }
        if (chunk.done) finalChunk = chunk;
      } catch (parseErr) {
        if (process.env.ARIA_DEBUG) console.warn('[Main] Malformed NDJSON buffer remainder:', parseErr.message);
      }
    }

    return {
      success: true,
      content: fullContent,
      evalCount: finalChunk?.eval_count || 0,
      promptEvalCount: finalChunk?.prompt_eval_count || 0,
      doneReason: finalChunk?.done_reason || null
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const abortedBy = streamAbortReasons.get(requestId) || 'user';
      return {
        success: abortedBy === 'auto-length',
        error: abortedBy === 'timeout' ? 'Request timed out' : 'Request aborted',
        aborted: true,
        abortedBy,
        content: fullContent,
        evalCount: finalChunk?.eval_count || 0,
        promptEvalCount: finalChunk?.prompt_eval_count || 0
      };
    }
    console.error('[IPC] ollama-chat-stream error:', error);
    return { success: false, error: error.message };
  } finally {
    streamAbortControllers.delete(requestId);
    streamAbortReasons.delete(requestId);
  }
});

/**
 * Abort an active streaming request by requestId.
 */
ipcMain.handle('ollama-stream-abort', async (event, { requestId, reason = 'user' }) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ollama-stream-abort');
  }

  const controller = streamAbortControllers.get(requestId);
  if (controller) {
    streamAbortReasons.set(requestId, reason);
    controller.abort();
    streamAbortControllers.delete(requestId);
    return { success: true };
  }
  return { success: false, error: 'No active stream for this requestId' };
});

/**
 * Unload model from VRAM (keep_alive: 0).
 * Params: { ollamaUrl, model }
 */
ipcMain.handle('ollama-unload', async (event, params = {}) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ollama-unload');
  }

  const { ollamaUrl = OLLAMA_DEFAULT_URL, model } = params;
  if (!model) return { success: false, error: 'Missing model name' };
  const trustedUrl = validateTrustedLocalServiceUrl('ollama', ollamaUrl);
  if (!trustedUrl) return { success: false, error: 'Ollama URL must match the configured local service endpoint' };

  try {
    await fetch(`${trustedUrl.origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [], keep_alive: 0 }),
      signal: AbortSignal.timeout(10000)
    });
    console.log('[IPC] Model unloaded:', model);
    return { success: true };
  } catch (error) {
    console.error('[IPC] ollama-unload error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Fetch available Ollama models (/api/tags). Filters out embedding models.
 * Params: { ollamaUrl }
 */
ipcMain.handle('ollama-models', async (event, params = {}) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ollama-models');
  }

  const { ollamaUrl = OLLAMA_DEFAULT_URL } = params;
  const trustedUrl = validateTrustedLocalServiceUrl('ollama', ollamaUrl);
  if (!trustedUrl) return { success: false, error: 'Ollama URL must match the configured local service endpoint' };

  try {
    const response = await fetch(`${trustedUrl.origin}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return { success: false, error: `Ollama error (${response.status})` };
    }

    const data = await response.json();
    if (!Array.isArray(data.models)) {
      return { success: true, models: [], totalCount: 0 };
    }
    const allModels = data.models
      .filter(m => m && typeof m.name === 'string')
      .map(m => m.name);

    // Same filter as api.js: block embedding/BERT models
    const chatModels = allModels.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('embed') && !lower.includes('bert');
    });

    return { success: true, models: chatModels, totalCount: allModels.length };
  } catch (error) {
    console.error('[IPC] ollama-models error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Pull a model from the Ollama registry, streaming progress events
 * to the renderer via the 'ollama-pull-progress' channel.
 * Params: { tag, ollamaUrl }
 */
ipcMain.handle('ollama-pull', async (event, params = {}) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ollama-pull');
  }

  const { tag, ollamaUrl = OLLAMA_DEFAULT_URL } = params;
  if (!tag || typeof tag !== 'string') return { success: false, error: 'Missing model tag' };
  const trustedUrl = validateTrustedLocalServiceUrl('ollama', ollamaUrl);
  if (!trustedUrl) return { success: false, error: 'Ollama URL must match the configured local service endpoint' };

  try {
    const response = await fetch(`${trustedUrl.origin}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tag, stream: true })
    });
    if (!response.ok || !response.body) {
      return { success: false, error: `Ollama pull returned ${response.status}` };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastError = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.error) lastError = evt.error;
          if (event.sender.isDestroyed()) break;
          event.sender.send('ollama-pull-progress', { tag, ...evt });
        } catch {
          // skip malformed line
        }
      }
      if (event.sender.isDestroyed()) break;
    }

    if (lastError) return { success: false, error: lastError };
    return { success: true };
  } catch (error) {
    console.error('[IPC] ollama-pull error:', error);
    return { success: false, error: String(error?.message || error) };
  }
});

/**
 * Check whether a model tag exists on ollama.com via HEAD request.
 * Params: { tag }
 */
ipcMain.handle('ollama-check-tag', async (event, params = {}) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ollama-check-tag');
  }

  const { tag } = params;
  if (!tag || typeof tag !== 'string') return { success: false, error: 'Missing model tag' };

  try {
    const response = await fetch(`https://ollama.com/library/${encodeURIComponent(tag)}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    return { success: true, exists: response.ok };
  } catch (error) {
    console.error('[IPC] ollama-check-tag error:', error);
    return { success: false, error: String(error?.message || error) };
  }
});

/**
 * Get model capabilities via /api/show (context length, parameter size).
 * Params: { ollamaUrl, model }
 */
ipcMain.handle('ollama-model-info', async (event, params = {}) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'ollama-model-info');
  }

  const { ollamaUrl = OLLAMA_DEFAULT_URL, model } = params;
  if (!model) return { success: false, error: 'Missing model name' };
  const trustedUrl = validateTrustedLocalServiceUrl('ollama', ollamaUrl);
  if (!trustedUrl) return { success: false, error: 'Ollama URL must match the configured local service endpoint' };

  const defaults = { contextLength: 4096, parameterSize: '7B' };

  try {
    const response = await fetch(`${trustedUrl.origin}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return { success: true, fallback: true, ...defaults };

    const info = await response.json();

    // Extract context length from model_info (supports multiple architectures)
    let ctxParam = info.model_info?.['general.context_length']
      || info.model_info?.['llama.context_length']
      || info.model_info?.['qwen2.context_length']
      || info.model_info?.['qwen35.context_length'];

    if (typeof ctxParam !== 'number') {
      const mi = info.model_info || {};
      for (const key of Object.keys(mi)) {
        if (key.endsWith('.context_length') && typeof mi[key] === 'number') {
          ctxParam = mi[key];
          break;
        }
      }
    }

    return {
      success: true,
      contextLength: typeof ctxParam === 'number' ? ctxParam : 4096,
      parameterSize: info.details?.parameter_size || '7B'
    };
  } catch (error) {
    console.error('[IPC] ollama-model-info error:', error);
    return { success: true, fallback: true, ...defaults };
  }
});

// ===========================================
// SESSION MANAGEMENT
// ===========================================

const getSessionsPath = () => path.join(app.getPath('userData'), 'sessions');

ipcMain.handle('save-session', async (event, { sessionId, data }) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'save-session');
  }

  try {
    if (!isValidSessionId(sessionId)) {
      return { success: false, error: 'Invalid session ID' };
    }
    const sessionsDir = getSessionsPath();

    await fs.promises.mkdir(sessionsDir, { recursive: true });

    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
    const incomingUpdated = Date.parse(data?.lastUpdated || data?.savedAt || 0) || Date.now();

    try {
      const existingRaw = await fs.promises.readFile(sessionPath, 'utf-8');
      const existingData = JSON.parse(existingRaw);
      const existingUpdated = Date.parse(existingData?.lastUpdated || existingData?.savedAt || 0) || 0;
      if (existingUpdated > incomingUpdated) {
        return { success: true, skipped: 'stale-session-snapshot' };
      }
    } catch (readError) {
      if (readError.code !== 'ENOENT') {
        throw readError;
      }
    }

    const sessionData = {
      ...data,
      dataVersion: DATA_VERSION,
      savedAt: new Date().toISOString(),
    };

    await fs.promises.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));

    return { success: true };
  } catch (error) {
    console.error('Save session error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-session', async (event, { sessionId }) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'load-session');
  }

  try {
    if (!isValidSessionId(sessionId)) {
      return { success: false, error: 'Invalid session ID' };
    }
    const sessionPath = path.join(getSessionsPath(), `${sessionId}.json`);

    try {
      const raw = await fs.promises.readFile(sessionPath, 'utf-8');
      const data = JSON.parse(raw);

      // Normalize missing fields for old sessions
      if (data.passionLevel === undefined) data.passionLevel = 0;
      if (!Array.isArray(data.conversationHistory)) data.conversationHistory = [];
      if (data.sceneMemory === undefined) data.sceneMemory = null;
      if (!data.lastUpdated) data.lastUpdated = data.savedAt || new Date().toISOString();
      if (!data.createdAt) data.createdAt = data.savedAt || new Date().toISOString();

      return { success: true, data };
    } catch (err) {
      if (err.code === 'ENOENT') return { success: false, error: 'Session not found' };
      throw err;
    }
  } catch (error) {
    console.error('Load session error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-sessions', async (event) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'list-sessions');
  }

  try {
    const sessionsDir = getSessionsPath();

    let dirFiles;
    try {
      dirFiles = await fs.promises.readdir(sessionsDir);
    } catch (err) {
      if (err.code === 'ENOENT') return { success: true, sessions: [] };
      throw err;
    }

    // Clean up ghost sessions from old preload.js bugs
    for (const ghost of ['undefined.json', 'null.json']) {
      try { await fs.promises.unlink(path.join(sessionsDir, ghost)); } catch { /* ignore if missing */ }
    }

    const jsonFiles = dirFiles
      .filter(file => file.endsWith('.json'))
      .filter(file => {
        const id = file.replace('.json', '');
        return id && id !== 'undefined' && id !== 'null';
      });

    const sessions = await Promise.all(jsonFiles.map(async (file) => {
      const sessionPath = path.join(sessionsDir, file);
      try {
        const raw = await fs.promises.readFile(sessionPath, 'utf-8');
        const data = JSON.parse(raw);
        const sessionId = file.replace('.json', '');
        return { id: sessionId, ...data };
      } catch {
        console.warn(`[Main] Skipping corrupt session file: ${file}`);
        return null;
      }
    }));

    return { success: true, sessions: sessions.filter(Boolean) };
  } catch (error) {
    console.error('List sessions error:', error);
    return { success: false, sessions: [], error: error.message };
  }
});

ipcMain.handle('delete-session', async (event, { sessionId }) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'delete-session');
  }

  try {
    if (!isValidSessionId(sessionId)) {
      return { success: false, error: 'Invalid session ID' };
    }
    const sessionPath = path.join(getSessionsPath(), `${sessionId}.json`);

    try { await fs.promises.unlink(sessionPath); } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    return { success: true };
  } catch (error) {
    console.error('Delete session error:', error);
    return { success: false, error: error.message };
  }
});

// ===========================================
// SETTINGS MANAGEMENT
// ===========================================

const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json');

let settingsWriteQueue = Promise.resolve();
let settingsTempCounter = 0;

async function persistSettingsAtomic(newSettings) {
  const settingsPath = getSettingsPath();
  let existingSettings = {};
  try {
    const raw = await fs.promises.readFile(settingsPath, 'utf-8');
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        existingSettings = JSON.parse(trimmed);
      } catch {
        existingSettings = {};
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const mergedSettings = { ...existingSettings, ...newSettings };
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.${settingsTempCounter++}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(mergedSettings, null, 2));
  try {
    await fs.promises.rename(tempPath, settingsPath);
  } catch (err) {
    try { await fs.promises.unlink(tempPath); } catch {}
    throw err;
  }
  return { existingSettings, mergedSettings };
}

ipcMain.handle('save-settings', async (event, newSettings) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'save-settings');
  }

  if (newSettings === null || typeof newSettings !== 'object' || Array.isArray(newSettings)) {
    return { success: false, error: 'Invalid settings: expected an object' };
  }

  const job = settingsWriteQueue.then(() => persistSettingsAtomic(newSettings), () => persistSettingsAtomic(newSettings));
  settingsWriteQueue = job.catch(() => {});

  try {
    const { mergedSettings } = await job;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-updated', mergedSettings);
    }

    return { success: true };
  } catch (error) {
    console.error('Save settings error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-settings', async (event) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'load-settings');
  }

  try {
    const settingsPath = getSettingsPath();

    let settings;
    try {
      const raw = await fs.promises.readFile(settingsPath, 'utf-8');
      settings = JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return { success: true, settings: {} };
      console.warn('[Main] Settings corrupt, using defaults:', err.message);
      return { success: true, settings: {} };
    }

    // Migration: stamp dataVersion, replace old default models, backfill missing keys
    let migrated = false;

    if (!settings.dataVersion || settings.dataVersion < DATA_VERSION) {
      settings.dataVersion = DATA_VERSION;
      migrated = true;
    }

    // Replace known old default model names with current default
    if (settings.ollamaModel && KNOWN_OLD_DEFAULT_MODELS.includes(settings.ollamaModel)) {
      console.log(`[Main] Migrating old default model "${settings.ollamaModel}" → "${DEFAULT_MODEL_NAME}"`);
      settings.ollamaModel = DEFAULT_MODEL_NAME;
      migrated = true;
    }

    // Backfill missing keys from defaults (referencing api.js DEFAULT_SETTINGS via shared constants)
    const BACKFILL_DEFAULTS = {
      ollamaUrl: OLLAMA_DEFAULT_URL,
      ollamaModel: DEFAULT_MODEL_NAME,
      contextSize: 4096,
      maxResponseTokens: 256
    };
    for (const [key, value] of Object.entries(BACKFILL_DEFAULTS)) {
      if (settings[key] === undefined) {
        settings[key] = value;
        migrated = true;
      }
    }

    if (migrated) {
      try {
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        console.log('[Main] Settings migrated and saved');
      } catch (writeErr) {
        console.warn('[Main] Failed to write migrated settings:', writeErr.message);
      }
    }

    return { success: true, settings };
  } catch (error) {
    console.error('Load settings error:', error);
    return { success: true, settings: {} };
  }
});

console.log('[Aria] Main process started');
