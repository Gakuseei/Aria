// Electron Main Process - v0.2.5
// Deep Immersion with Passion Manager, Image Generation & Voice/TTS
// AGGRESSIVE CSP: Only 'self', '127.0.0.1', 'localhost'

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const net = require('net');
const dns = require('dns').promises;
const { fileURLToPath } = require('url');
const dotenv = require('dotenv');
const platform = require('./lib/platform');
const piperTool = require('./lib/tools/piper');
const {
  CONTROL_CHAR_REGEX,
  getTrustedLoopbackConnectSrcOriginsForService,
  getTrustedLoopbackHttpOriginsForService,
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
const MAX_VOICE_MODEL_DOWNLOAD_BYTES = 1024 * 1024 * 1024;
const ALLOWED_PIPER_BASENAMES = new Set(['piper', 'piper.exe']);
const FILE_DIALOG_KIND = Object.freeze({
  PIPER_BINARY: 'piper-binary',
  VOICE_MODEL: 'voice-model',
});
const VOICE_MODEL_DOWNLOAD_ALLOWLIST = new Map([
  ['en_US-amy-medium', {
    urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx',
    urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json',
  }],
  ['en_US-ryan-medium', {
    urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx',
    urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json',
  }],
  ['en_GB-alba-medium', {
    urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx',
    urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json',
  }],
  ['de_DE-thorsten-medium', {
    urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx',
    urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json',
  }],
  ['fr_FR-siwis-medium', {
    urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx',
    urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json',
  }],
  ['es_ES-mls_10246-low', {
    urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx',
    urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx.json',
  }],
  ['zh_CN-huayan-medium', {
    urlOnnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx',
    urlJson: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json',
  }],
]);
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

function stripOuterQuotes(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '').trim() : '';
}

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

function looksLikePiperBinaryPath(filePath) {
  return ALLOWED_PIPER_BASENAMES.has(path.basename(filePath).toLowerCase());
}

function looksLikeVoiceModelPath(filePath) {
  return path.extname(filePath).toLowerCase() === '.onnx';
}

async function resolveExistingFilePath(rawPath) {
  const candidate = stripOuterQuotes(rawPath);
  if (!candidate || CONTROL_CHAR_REGEX.test(candidate)) {
    return null;
  }

  try {
    const stat = await fs.promises.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return null;
    }

    const resolvedPath = await fs.promises.realpath(candidate);
    const resolvedStat = await fs.promises.stat(resolvedPath);
    if (!resolvedStat.isFile()) {
      return null;
    }

    return resolvedPath;
  } catch {
    return null;
  }
}

async function resolveRuntimePiperPath(rawPath) {
  const configuredPath = await resolveExistingFilePath(rawPath);
  if (configuredPath && looksLikePiperBinaryPath(configuredPath)) {
    return configuredPath;
  }

  const bundledPath = await resolveExistingFilePath(path.join(__dirname, 'tools', 'piper', platform.getBinaryName('piper')));
  if (bundledPath && looksLikePiperBinaryPath(bundledPath)) {
    return bundledPath;
  }

  try {
    const detectedPath = await piperTool.detect();
    const systemPath = await resolveExistingFilePath(detectedPath);
    if (systemPath && looksLikePiperBinaryPath(systemPath)) {
      return systemPath;
    }
  } catch (error) {
    console.warn('[Voice] Failed to auto-detect Piper:', error.message);
  }

  return null;
}

async function resolveRuntimeVoiceModelPath(rawPath) {
  const resolvedPath = await resolveExistingFilePath(rawPath);
  if (!resolvedPath || !looksLikeVoiceModelPath(resolvedPath)) {
    return null;
  }

  return resolvedPath;
}

async function resolveVoiceModelConfigPath(modelPath) {
  return resolveExistingFilePath(`${modelPath}.json`);
}

function normalizeAllowedVoiceDownload(params = {}) {
  const { name, urlOnnx, urlJson } = params;
  const allowlisted = VOICE_MODEL_DOWNLOAD_ALLOWLIST.get(name);
  if (!allowlisted) {
    return null;
  }

  if (urlOnnx !== allowlisted.urlOnnx || urlJson !== allowlisted.urlJson) {
    return null;
  }

  return allowlisted;
}

function classifyFileDialogRequest(filters) {
  if (!Array.isArray(filters) || filters.length !== 1) {
    return null;
  }

  const [entry] = filters;
  const extensions = Array.isArray(entry?.extensions)
    ? [...new Set(entry.extensions.map(extension => String(extension).toLowerCase().trim()).filter(Boolean))]
    : [];

  if (extensions.length === 1 && extensions[0] === 'onnx') {
    return {
      kind: FILE_DIALOG_KIND.VOICE_MODEL,
      filters: [{ name: entry?.name || 'ONNX Model', extensions: ['onnx'] }],
    };
  }

  if (extensions.length === 1 && extensions[0] === 'exe') {
    return {
      kind: FILE_DIALOG_KIND.PIPER_BINARY,
      filters: process.platform === 'win32' ? [{ name: 'Piper Executable', extensions: ['exe'] }] : [],
    };
  }

  return null;
}

async function validateFileDialogSelection(kind, selectedPath) {
  if (kind === FILE_DIALOG_KIND.PIPER_BINARY) {
    return resolveRuntimePiperPath(selectedPath);
  }

  if (kind === FILE_DIALOG_KIND.VOICE_MODEL) {
    return resolveRuntimeVoiceModelPath(selectedPath);
  }

  return null;
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
const LOCAL_CONNECT_SRC_SERVICES = Object.freeze(['ollama', 'imageGen']);
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

/**
 * Download file with HTTP redirect support
 * Recursively follows 301, 302, 307 redirects
 */
/**
 * FIX 1: Robust recursive downloader with Promise support
 * Handles HTTP 301, 302, 307 redirects and validates JSON files
 */
function downloadWithRedirects(url, destPath, maxRedirects = 5) {
  return new Promise(async (resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const validatedUrl = await validateRemoteDownloadUrl(url);
    if (!validatedUrl) {
      return reject(new Error('Only HTTPS downloads from public hosts are allowed'));
    }

    // CRITICAL: Delete existing file to prevent corrupt artifacts
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath);
      } catch (unlinkError) {
        console.warn('[Download] Could not delete existing file:', unlinkError.message);
      }
    }

    const file = fs.createWriteStream(destPath);

    const cleanupDownload = () => {
      if (!file.closed) {
        file.close();
      }
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch (cleanupError) {
          console.warn('[Voice Download] Cleanup warning:', cleanupError.message);
        }
      }
    };

    const request = https.get(validatedUrl, async (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        const location = response.headers.location;
        if (!location) {
          return reject(new Error('Redirect location missing'));
        }
        // Resolve relative URLs
        const redirectUrl = location.startsWith('http') ? location : new URL(location, validatedUrl).toString();
        const validatedRedirectUrl = await validateRemoteDownloadUrl(redirectUrl);
        if (!validatedRedirectUrl) {
          return reject(new Error('Redirected download URL is not allowed'));
        }
        // Recursively call with new URL
        return downloadWithRedirects(validatedRedirectUrl.toString(), destPath, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }

      // ENHANCED ERROR HANDLING: Check for HTTP errors (404, 500, etc.)
      if (response.statusCode !== 200) {
        let errorMsg = `HTTP ${response.statusCode}`;
        if (response.statusCode === 404) {
          errorMsg = `HTTP 404 - File not found at: ${validatedUrl}`;
        }
        console.error('[Voice Download] Download failed:', errorMsg);
        cleanupDownload();
        return reject(new Error(errorMsg));
      }

      const declaredLength = Number.parseInt(response.headers['content-length'] || '', 10);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_VOICE_MODEL_DOWNLOAD_BYTES) {
        console.error('[Voice Download] Download rejected for size:', declaredLength);
        cleanupDownload();
        response.resume();
        return reject(new Error(`Download too large: ${declaredLength} bytes`));
      }

      let downloadedBytes = 0;
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > MAX_VOICE_MODEL_DOWNLOAD_BYTES) {
          response.destroy(new Error(`Download exceeded ${MAX_VOICE_MODEL_DOWNLOAD_BYTES} bytes`));
        }
      });
      response.on('error', (responseError) => {
        console.error('[Voice Download] Response error:', responseError.message);
        cleanupDownload();
        reject(responseError);
      });

      // Pipe successful response to file
      response.pipe(file);
      file.on('finish', () => {
        if (!file.closed) {
          file.close();
        }
        resolve();
      });

      file.on('error', (fileError) => {
        console.error('[Download] File stream error:', fileError.message);
        cleanupDownload();
        reject(new Error(`File write error: ${fileError.message}`));
      });
    });

    request.on('error', (error) => {
      console.error('[Voice Download] Network error:', error.message);
      cleanupDownload();
      reject(error);
    });
  });
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

  // TOOLS FOLDER HANDLER
  ipcMain.on('open-tools-folder', (event) => {
    if (!isTrustedIpcSender(event)) {
      blockUntrustedIpc(event, 'open-tools-folder');
      return;
    }

    const toolsPath = path.join(__dirname, 'tools');
    shell.openPath(toolsPath).then((err) => {
      if (err) console.error('Failed to open tools folder:', err);
    });
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
// v0.2.5: MULTIMEDIA IPC HANDLERS
// ===========================================

/**
 * Test Image Generation API connection
 * v1.0 FIX: Direct URL parameter (no nested object)
 */
ipcMain.handle('test-image-gen', async (event, url) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'test-image-gen');
  }

  try {
    const trustedUrl = validateTrustedLocalServiceUrl('imageGen', url);
    if (!trustedUrl) {
      return { success: false, error: 'Image generation URL must match the configured local service endpoint' };
    }
    const testUrl = `${trustedUrl.origin}/sdapi/v1/options`;
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      return {
        success: true,
      };
    } else {
      return {
        success: false,
        error: `API responded with status ${response.status}`,
      };
    }
  } catch (error) {
    console.error('[V1.0 ImageGen Test] Error:', error);
    
    let errorMessage = 'Connection failed.\n\n';

    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      errorMessage += 'Timeout - The API is not responding.\n\n';
      errorMessage += 'Check:\n• Is Stability Matrix running?\n• Is the WebUI started (Launch Button)?\n• Wait 30 seconds after starting!';
    } else if (error.message.includes('Failed to fetch') || error.message.includes('ECONNREFUSED')) {
      errorMessage += 'Cannot connect.\n\n';
      errorMessage += 'Check:\n• Is Stability Matrix open?\n• Is the WebUI started?\n• Can you see the WebUI in the browser (http://127.0.0.1:7860)?';
    } else {
      errorMessage += error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
});

/**
 * List available Stable Diffusion models (for Flux detection).
 */
ipcMain.handle('image-gen-models', async (event, params = {}) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'image-gen-models');
  }

  const { url = 'http://127.0.0.1:7860' } = params;
  try {
    const trustedUrl = validateTrustedLocalServiceUrl('imageGen', url);
    if (!trustedUrl) {
      return { success: false, error: 'Image generation URL must match the configured local service endpoint' };
    }
    const response = await fetch(`${trustedUrl.origin}/sdapi/v1/sd-models`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return { success: false, error: `Status ${response.status}` };
    const models = await response.json();
    return { success: true, models: models.map(m => m.title || m.model_name || '') };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Test Voice/TTS - CLI check with model validation
 * CRITICAL FIX: Validate both Piper executable and model JSON config
 */
ipcMain.handle('test-voice', async (event) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'test-voice');
  }

  try {
    const settings = loadSettingsSync();
    const piperPath = await resolveRuntimePiperPath(settings.piperPath || settings.piperExecutablePath);
    const configuredModelPath = settings.modelPath;

    if (!piperPath) {
      return {
        success: false,
        error: 'Piper executable not found. Install Piper or point Aria to a local piper binary named piper.',
      };
    }

    if (configuredModelPath) {
      const modelPath = await resolveRuntimeVoiceModelPath(configuredModelPath);
      if (!modelPath) {
        return {
          success: false,
          error: 'Voice model path is invalid. Use a local .onnx file.',
        };
      }

      const configPath = await resolveVoiceModelConfigPath(modelPath);
      if (!configPath) {
        return {
          success: false,
          error: `CRITICAL: Model config file missing! Expected: ${path.basename(modelPath)}.json. Please redownload the voice model.`,
        };
      }

      return {
        success: true,
        message: 'Piper CLI and model files validated',
        detectedPiperPath: piperPath,
        detectedModelPath: modelPath,
      };
    }

    return {
      success: true,
      message: 'Piper CLI found (model not configured)',
      detectedPiperPath: piperPath,
    };
  } catch (error) {
    console.error('[Voice Test] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * Get local voice models from userData/voice-models/
 */
ipcMain.handle('get-local-voice-models', async (event) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'get-local-voice-models');
  }

  try {
    const modelsDir = path.join(app.getPath('userData'), 'voice-models');
    
    if (!fs.existsSync(modelsDir)) {
      return { success: true, models: [] };
    }
    
    const files = fs.readdirSync(modelsDir);
    const onnxFiles = files
      .filter(file => file.endsWith('.onnx'))
      .map(file => {
        const fullPath = path.join(modelsDir, file);
        const name = file.replace('.onnx', '');
        return {
          name: name,
          path: fullPath
        };
      });
    
    return { success: true, models: onnxFiles };
  } catch (error) {
    console.error('[Voice Models] Error:', error);
    return { success: false, error: error.message, models: [] };
  }
});

/**
 * Generate image using local API (StabilityMatrix/AUTOMATIC1111)
 */
ipcMain.handle('generate-image', async (event, params) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'generate-image');
  }

  const { prompt, url, width, height, steps, imageGenTier } = params;

  try {
    const trustedUrl = validateTrustedLocalServiceUrl('imageGen', url);
    if (!trustedUrl) {
      return { success: false, error: 'Image generation URL must match the configured local service endpoint' };
    }
    const isPremium = imageGenTier === 'premium';
    const apiUrl = `${trustedUrl.origin}/sdapi/v1/txt2img`;
    
    // FLUX-specific settings for premium mode
    const requestBody = {
      prompt: prompt,
      negative_prompt: isPremium 
        ? 'blurry, low quality, distorted' 
        : 'blurry, low quality, distorted, ugly, bad anatomy',
      steps: isPremium ? (steps || 28) : (steps || 20),
      width: width || (isPremium ? 1024 : 512),
      height: height || (isPremium ? 1024 : 512),
      cfg_scale: isPremium ? 3.5 : 7,
      sampler_name: isPremium ? 'Euler' : 'Euler a',
    };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Image generation failed (${response.status}): ${errorText}`,
      };
    }
    
    const data = await response.json();
    
    if (data.images && data.images.length > 0) {
      return {
        success: true,
        imageBase64: `data:image/png;base64,${data.images[0]}`,
      };
    } else {
      return {
        success: false,
        error: 'No image data returned from API',
      };
    }
  } catch (error) {
    console.error('[V5.5 ImageGen] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * Generate speech using Piper CLI
 * CRITICAL FIX: Validate JSON config file to prevent 3221226505 crash
 */
ipcMain.handle('generate-speech', async (event, params) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'generate-speech');
  }

  const { text, piperPath, modelPath, voiceTier } = params;

  // PREMIUM MODE: Use Zonos API (Gradio via /gradio_api/)
  if (voiceTier === 'premium') {
    try {
      const zonosOrigins = getTrustedLoopbackHttpOriginsForService('zonos', loadSettingsSync());
      if (zonosOrigins.length === 0) {
        return { success: false, error: 'Zonos local service endpoint is not configured' };
      }

      let lastError = null;

      for (const baseUrl of zonosOrigins) {
        try {
          // Found via debug tool: /gradio_api/info exists, and api_name: generate_audio exists
          // Try direct call first (stateless)
          const callUrl = `${baseUrl}/gradio_api/call/generate_audio`;

          const response = await fetch(callUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
              data: [
                "Zyphra/Zonos-v0.1-transformer",  // model_choice
                text,                              // text
                "en-us",                           // language
                null,                              // speaker_audio
                null,                              // prefix_audio
                1.0, 0.05, 0.05, 0.05,            // emotions 1-4
                0.05, 0.05, 0.1, 0.2,             // emotions 5-8
                0.78,                              // vq_single
                24000,                             // fmax
                45.0,                              // pitch_std
                15.0,                              // speaking_rate
                4.0,                               // dnsmos_ovrl
                false,                             // speaker_noised
                2.0,                               // cfg_scale
                0,                                 // top_p
                0,                                 // top_k
                0,                                 // min_p
                0.5,                               // linear
                0.4,                               // confidence
                0.0,                               // quadratic
                420,                               // seed
                true,                              // randomize_seed
                ["emotion"]                        // unconditional_keys
              ]
            })
          });

          if (!response.ok) {
            // Fallback: Try without /gradio_api prefix just in case (e.g. /call/generate_audio)
            const responseFallback = await fetch(`${baseUrl}/call/generate_audio`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(10000),
              body: JSON.stringify({
                data: [
                  "Zyphra/Zonos-v0.1-transformer",
                  text,
                  "en-us",
                  null, null,
                  1.0, 0.05, 0.05, 0.05,
                  0.05, 0.05, 0.1, 0.2,
                  0.78, 24000, 45.0, 15.0, 4.0,
                  false, 2.0, 0, 0, 0,
                  0.5, 0.4, 0.0, 420, true,
                  ["emotion"]
                ]
              })
            });

            if (!responseFallback.ok) {
              const errorText = await responseFallback.text();
              console.warn(`[Voice] Zonos API error at ${baseUrl}:`, errorText);
              lastError = new Error(`Zonos API failed (${responseFallback.status}): ${errorText}`);
              continue;
            }

            // Handle fallback success same as main
            const result = await responseFallback.json();
            return await processGradioResult(baseUrl, result);
          }

          const result = await response.json();
          return await processGradioResult(baseUrl, result);
        } catch (originError) {
          console.warn(`[Voice] Zonos origin failed: ${baseUrl}`, originError);
          lastError = originError;
        }
      }

      return {
        success: false,
        error: `Zonos connection failed: ${lastError?.message || 'Is Zonos running on port 7860?'}`,
      };
    } catch (zonosError) {
      console.error('[Voice] Zonos error:', zonosError);
      return { success: false, error: `Zonos connection failed: ${zonosError.message}. Is Zonos running on port 7860?` };
    }
  }

  // Helper for processing Gradio call results
  async function processGradioResult(baseUrl, result) {
    if (result.event_id) {
        // Gradio 5 async/event based response - we got an event ID
        // Need to poll result endpoint: GET /gradio_api/call/generate_audio/{event_id}
        const pollUrl = `${baseUrl}/gradio_api/call/generate_audio/${result.event_id}`;
        
        // Poll for up to 30 seconds
        for(let i=0; i<60; i++) {
            await new Promise(r => setTimeout(r, 500));
            const pollResponse = await fetch(pollUrl, {
              signal: AbortSignal.timeout(5000),
            });
            
            if (!pollResponse.ok) continue; // Not ready?
            
            // Gradio SSE/Stream format is tricky via simple fetch, usually returns text/event-stream
            // But /call/ endpoint often returns JSON line events
            
            // Actually, for simplicity let's stick to the JSON response check
            // If the initial call returned data directly, it's simpler.
        }
        // If we end up here, complex polling is needed. 
        // Let's assume for now the /call/ endpoint might return the EVENT ID and we need to handle it.
        // However, many Gradio simple setups return data immediately if not queued. 
    }
    
    // Direct result format check
    // Handle { event_id } case by just trying to read the result assuming it finished or handle error
    if (result.event_id) {
       // Since handling event loop in node without SSE lib is complex, let's inform user
       // But wait, if we use /call/ endpoint, it usually returns JSON result immediately if synchronous?
       // Let's check 'data' field directly.
    }

    if (result.data && result.data[0]) {
      const audioInfo = result.data[0];
      
      // Standard Gradio 5 file obj: { path: "...", url: "...", orig_name: "..." }
      if (typeof audioInfo === 'object' && (audioInfo.path || audioInfo.url)) {
        if (audioInfo.path && typeof audioInfo.path === 'string' && audioInfo.path.includes('..')) {
          return { success: false, error: 'Invalid audio path' };
        }
        // Construct full URL
        let audioUrl = audioInfo.url;
        if (!audioUrl && audioInfo.path) {
           audioUrl = `${baseUrl}/file=${audioInfo.path}`;
        }
        if (audioUrl && !audioUrl.startsWith('http')) {
           audioUrl = `${baseUrl}/file=${audioInfo.path}`; // Safety fallback
        }

        const trustedAudioUrl = validateTrustedLocalServiceUrl('zonos', audioUrl, {
          allowPath: true,
          allowedPathPrefixes: ['/file=', '/gradio_api/file='],
          extraUrls: [baseUrl],
        });
        if (!trustedAudioUrl) {
          return { success: false, error: 'Invalid audio download URL' };
        }

        const audioResponse = await fetch(trustedAudioUrl.toString(), {
          signal: AbortSignal.timeout(10000),
        });
        if (!audioResponse.ok) {
          return { success: false, error: `Failed to fetch generated audio (${audioResponse.status})` };
        }
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        return { success: true, audioData: `data:audio/wav;base64,${audioBuffer.toString('base64')}` };
      }
    }
    
    console.error('[Voice] Zonos returned unexpected data format:', JSON.stringify(result?.data?.[0])?.slice(0, 200));
    return { success: false, error: 'Zonos returned unexpected data format' };
  }

  // STANDARD MODE: Use Piper TTS
  return new Promise(async (resolve) => {
    try {
      const settings = loadSettingsSync();
      const resolvedPiperPath = await resolveRuntimePiperPath(piperPath || settings.piperPath || settings.piperExecutablePath);
      const resolvedModelPath = await resolveRuntimeVoiceModelPath(modelPath || settings.modelPath);

      if (!text || !resolvedPiperPath || !resolvedModelPath) {
        console.error('[Voice] Missing required parameters:', { text: !!text, piperPath: !!resolvedPiperPath, modelPath: !!resolvedModelPath });
        return resolve({ success: false, error: 'Missing required parameters' });
      }

      const resolvedConfigPath = await resolveVoiceModelConfigPath(resolvedModelPath);
      if (!resolvedConfigPath) {
        return resolve({
          success: false,
          error: `CRITICAL: Model config file missing! Expected: ${path.basename(resolvedModelPath)}.json. Please redownload the voice model.`
        });
      }

      const cleanText = text.trim();
      if (!cleanText) {
        return resolve({ success: false, error: 'Empty text' });
      }

      const tempDir = path.join(app.getPath('temp'), 'aria-voice');
      ensureDir(tempDir);

      const timestamp = Date.now();
      const outputFile = path.join(tempDir, `speech-${timestamp}.wav`);
      const args = ['--model', resolvedModelPath, '--output_file', outputFile];

      const child = spawn(resolvedPiperPath, args, {
        shell: false,
        stdio: ['pipe', 'ignore', 'pipe'],
        encoding: 'utf8'
      });

      let stderrData = '';

      // PROTECT STDIN: Handle EPIPE errors if Piper crashes instantly
      child.stdin.on('error', (err) => {
        if (err.code !== 'EPIPE') {
          console.error('[Voice] Stdin error:', err);
        } else {
          console.warn('[Voice] Stdin EPIPE (pipe broken) - Piper may have crashed early');
        }
      });

      // Write text to stdin
      try {
        child.stdin.setDefaultEncoding('utf8');
        child.stdin.write(cleanText, 'utf8', (writeError) => {
          if (writeError) {
            console.error('[Voice] stdin write error:', writeError);
            return resolve({ success: false, error: `Failed to write text to stdin: ${writeError.message}` });
          }
          child.stdin.end();
        });
      } catch (writeException) {
        console.error('[Voice] Exception writing to stdin:', writeException);
        return resolve({ success: false, error: `Failed to write to stdin: ${writeException.message}` });
      }

      // Capture stderr
      child.stderr.on('data', (data) => {
        const errorChunk = data.toString();
        stderrData += errorChunk;
      });

      // Handle process close
      child.on('close', (code) => {
        if (code === 0) {
          // Success - read output file
          setTimeout(() => {
            try {
              if (!fs.existsSync(outputFile)) {
                console.error('[Voice] Output file not created after process exit');
                return resolve({ success: false, error: 'Output file missing - Piper may have failed silently' });
              }

              const audioBuffer = fs.readFileSync(outputFile);
              const audioBase64 = audioBuffer.toString('base64');

              // Cleanup temp file
              try {
                fs.unlinkSync(outputFile);
              } catch (cleanupError) {
                console.warn('[Voice] Cleanup warning:', cleanupError.message);
              }

              resolve({
                success: true,
                audioData: `data:audio/wav;base64,${audioBase64}`,
              });
            } catch (readError) {
              console.error('[Voice] Read error:', readError.message);
              resolve({ success: false, error: `Failed to read output file: ${readError.message}` });
            }
          }, 100);
        } else {
          // Process failed
          let errorMsg = `Piper process failed with code ${code}`;
          
          // ENHANCED ERROR MESSAGE for Access Violation
          if (code === 3221226505) {
            errorMsg += ' (Access Violation - usually caused by missing or corrupt model JSON config file)';
            console.error('[Voice] CRITICAL: Access Violation detected!');
            console.error('[Voice] This usually means the .json config file is missing or invalid.');
            console.error('[Voice] Expected JSON file:', `${resolvedModelPath}.json`);
          }
          
          console.error('[Voice] Full stderr:', stderrData);
          resolve({ 
            success: false, 
            error: `${errorMsg}: ${stderrData || 'Unknown error'}` 
          });
        }
      });

      child.on('error', (error) => {
        console.error('[Voice] Spawn error:', error.message);
        console.error('[Voice] Error details:', error);
        resolve({ success: false, error: `Failed to spawn Piper process: ${error.message}` });
      });

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        if (!child.killed) {
          console.error('[Voice] Process timeout - killing child process');
          child.kill();
          resolve({ success: false, error: 'Process timeout after 30 seconds' });
        }
      }, 30000);

      // Clear timeout on completion
      child.on('close', () => {
        clearTimeout(timeout);
      });
    } catch (error) {
      console.error('[Voice] Unexpected error:', error.message);
      console.error('[Voice] Error stack:', error.stack);
      resolve({ success: false, error: `Unexpected error: ${error.message}` });
    }
  });
});

/**
 * Download voice model files (.onnx and .json)
 */
ipcMain.handle('download-voice-model', async (event, params) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'download-voice-model');
  }

  const { name, urlOnnx, urlJson } = params;

  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return { success: false, error: 'Invalid model name' };
  }

  const allowlistedDownload = normalizeAllowedVoiceDownload(params);
  if (!name || !allowlistedDownload) {
    return { success: false, error: 'Voice model download is not allowed' };
  }

  const validatedOnnxUrl = await validateRemoteDownloadUrl(allowlistedDownload.urlOnnx);
  const validatedJsonUrl = await validateRemoteDownloadUrl(allowlistedDownload.urlJson);
  if (!validatedOnnxUrl || !validatedJsonUrl) {
    return { success: false, error: 'Voice model downloads must use HTTPS from approved public hosts' };
  }

  // Define download folder
  const downloadDir = path.join(app.getPath('userData'), 'voice-models');
  ensureDir(downloadDir);

  const onnxPath = path.join(downloadDir, `${name}.onnx`);
  const jsonPath = path.join(downloadDir, `${name}.json`);

  // Helper function to cleanup both files on error
  const cleanupFiles = () => {
    if (fs.existsSync(onnxPath)) {
      try {
        fs.unlinkSync(onnxPath);
      } catch (err) {
        console.warn('[Voice Download] Could not delete .onnx file:', err.message);
      }
    }
    if (fs.existsSync(jsonPath)) {
      try {
        fs.unlinkSync(jsonPath);
      } catch (err) {
        console.warn('[Voice Download] Could not delete .json file:', err.message);
      }
    }
  };

  try {
    // FIX 1: Download .onnx file with Promise-based redirect support
    try {
      await downloadWithRedirects(validatedOnnxUrl.toString(), onnxPath);
    } catch (onnxError) {
      console.error('[Voice Download] .onnx download failed:', onnxError.message);
      cleanupFiles();
      return { success: false, error: `Failed to download .onnx file: ${onnxError.message}` };
    }

    // FIX 1: Download .json file with Promise-based redirect support + validation
    try {
      await downloadWithRedirects(validatedJsonUrl.toString(), jsonPath);
    } catch (jsonError) {
      console.error('[Voice Download] .json download failed:', jsonError.message);
      cleanupFiles();
      return { success: false, error: `Failed to download .json file: ${jsonError.message}` };
    }
    
    // CRITICAL: Validate JSON file (check for HTML/error pages)
    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
      const trimmedContent = jsonContent.trim();
      const firstChar = trimmedContent.charAt(0);
      
      // FIX 1: Check if first char is '<' (HTML) or try JSON.parse
      if (firstChar === '<') {
        console.error('[Voice Download] Invalid JSON file (starts with HTML tag)');
        cleanupFiles();
        return { success: false, error: 'Invalid JSON downloaded (HTML redirect page detected)' };
      }
      
      // Try to parse JSON
      try {
        JSON.parse(trimmedContent);
      } catch (parseError) {
        console.error('[Voice Download] JSON parse failed:', parseError.message);
        cleanupFiles();
        return { success: false, error: 'Invalid JSON downloaded (parse error)' };
      }
      
    } catch (validationError) {
      console.error('[Voice Download] JSON validation error:', validationError);
      cleanupFiles();
      return { success: false, error: `JSON validation failed: ${validationError.message}` };
    }

    return {
      success: true,
      path: onnxPath
    };
  } catch (error) {
    console.error('[Voice Download] Unexpected error:', error);
    cleanupFiles();
    return { success: false, error: error.message };
  }
});

/**
 * Open file dialog
 */
ipcMain.handle('open-file-dialog', async (event, filters) => {
  if (!isTrustedIpcSender(event)) {
    return null;
  }

  const request = classifyFileDialogRequest(filters);
  if (!request) {
    console.warn('[Dialog] Rejected unsupported file dialog request');
    return null;
  }

  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: request.filters,
  });

  if (result.canceled) {
    return null;
  }

  return validateFileDialogSelection(request.kind, result.filePaths[0]);
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
        options,
        stop,
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
        options,
        stop
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

ipcMain.handle('save-settings', async (event, newSettings) => {
  if (!isTrustedIpcSender(event)) {
    return blockUntrustedIpc(event, 'save-settings');
  }

  try {
    const settingsPath = getSettingsPath();
    
    // Merge with existing settings to preserve all values
    let existingSettings = {};
    try {
      const raw = await fs.promises.readFile(settingsPath, 'utf-8');
      existingSettings = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (newSettings === null || typeof newSettings !== 'object' || Array.isArray(newSettings)) {
      return { success: false, error: 'Invalid settings: expected an object' };
    }
    const mergedSettings = { ...existingSettings, ...newSettings };
    await fs.promises.writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2));
    
    // FIX 3: Broadcast voice status changes to all renderers
    if ('voiceEnabled' in newSettings && newSettings.voiceEnabled !== existingSettings.voiceEnabled) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voice-status-changed', newSettings.voiceEnabled);
      }
    }
    
    // FIX 1: Broadcast settings-updated event to all renderers
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

const STUB_HANDLERS = [
  'zonos-auto-install', 'zonos-check-status', 'zonos-is-installed',
  'zonos-cancel-install', 'zonos-get-progress'
];
STUB_HANDLERS.forEach(name => {
  ipcMain.handle(name, async () => ({ success: false, error: 'Not yet available' }));
});


