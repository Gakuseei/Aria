const { contextBridge, ipcRenderer } = require('electron');

function isWaylandSession() {
  if (process.platform !== 'linux' || !process.env || typeof process.env !== 'object') {
    return false;
  }

  const sessionType = typeof process.env.XDG_SESSION_TYPE === 'string'
    ? process.env.XDG_SESSION_TYPE.trim().toLowerCase()
    : '';
  const waylandDisplay = typeof process.env.WAYLAND_DISPLAY === 'string'
    ? process.env.WAYLAND_DISPLAY.trim()
    : '';
  const ozonePlatform = typeof process.env.OZONE_PLATFORM === 'string'
    ? process.env.OZONE_PLATFORM.trim().toLowerCase()
    : '';
  const ozonePlatformHint = typeof process.env.ELECTRON_OZONE_PLATFORM_HINT === 'string'
    ? process.env.ELECTRON_OZONE_PLATFORM_HINT.trim().toLowerCase()
    : '';

  if (ozonePlatform === 'x11' || ozonePlatformHint === 'x11') {
    return false;
  }

  return ozonePlatform === 'wayland'
    || ozonePlatformHint === 'wayland'
    || sessionType === 'wayland'
    || Boolean(waylandDisplay);
}

const useSystemTitleBar = isWaylandSession();

function createIpcListener(channel) {
  return (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  windowChrome: {
    useSystemTitleBar,
  },

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // Open external URL
  openExternal: (url) => ipcRenderer.send('open-external', url),
  
  // Open Tools Folder
  openToolsFolder: () => ipcRenderer.send('open-tools-folder'),
  
  // Run Tool Script (True One-Click)
  runToolScript: (scriptName) => ipcRenderer.send('run-tool-script', scriptName),
  
  // AI Communication
  aiChat: (params) => ipcRenderer.invoke('ai-chat', params),
  abortAiChat: (tag) => ipcRenderer.invoke('abort-ai-chat', { tag }),
  aiGenerateCharacter: (params) => ipcRenderer.invoke('ai-generate-character', params),

  // Ollama IPC (streaming, model management)
  ollamaChatStream: (params) => ipcRenderer.invoke('ollama-chat-stream', params),
  ollamaStreamAbort: (requestId, reason = 'user') => ipcRenderer.invoke('ollama-stream-abort', { requestId, reason }),
  onOllamaStreamToken: createIpcListener('ollama-stream-token'),
  ollamaUnload: (params) => ipcRenderer.invoke('ollama-unload', params),
  ollamaModels: (params) => ipcRenderer.invoke('ollama-models', params),
  ollamaModelInfo: (params) => ipcRenderer.invoke('ollama-model-info', params),
  
  // Session Management
  saveSession: (sessionId, data) => ipcRenderer.invoke('save-session', { sessionId, data }),
  loadSession: (sessionId) => ipcRenderer.invoke('load-session', { sessionId }),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', { sessionId }),

  // Settings
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  
  // Voice status change listener
  onVoiceStatusChanged: createIpcListener('voice-status-changed'),

  // Settings updated listener
  onSettingsUpdated: createIpcListener('settings-updated'),
  
  // v0.2.5: Multimedia IPC handlers
  imageGenModels: (params) => ipcRenderer.invoke('image-gen-models', params),
  testImageGen: (params) => ipcRenderer.invoke('test-image-gen', params),
  testVoice: (params) => ipcRenderer.invoke('test-voice', params),
  generateImage: (params) => ipcRenderer.invoke('generate-image', params),
  generateSpeech: (params) => ipcRenderer.invoke('generate-speech', params),

  // File dialog
  selectFile: (filters) => ipcRenderer.invoke('open-file-dialog', filters),

  // Voice model download
  downloadVoiceModel: (params) => ipcRenderer.invoke('download-voice-model', params),
  
  // Get local voice models
  getLocalVoiceModels: () => ipcRenderer.invoke('get-local-voice-models'),
  
  // ZONOS AUTO INSTALLER - True One-Click
  zonosAutoInstall: () => ipcRenderer.invoke('zonos-auto-install'),
  zonosCheckStatus: () => ipcRenderer.invoke('zonos-check-status'),
  zonosIsInstalled: () => ipcRenderer.invoke('zonos-is-installed'),
  zonosCancelInstall: () => ipcRenderer.invoke('zonos-cancel-install'),
  zonosGetProgress: () => ipcRenderer.invoke('zonos-get-progress'),
});
