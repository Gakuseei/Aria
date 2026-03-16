const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
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
  aiCreativeWrite: (params) => ipcRenderer.invoke('ai-creative-write', params),

  // Ollama IPC (streaming, model management)
  ollamaChatStream: (params) => ipcRenderer.invoke('ollama-chat-stream', params),
  ollamaStreamAbort: (requestId) => ipcRenderer.invoke('ollama-stream-abort', { requestId }),
  onOllamaStreamToken: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ollama-stream-token', handler);
    return () => ipcRenderer.removeListener('ollama-stream-token', handler);
  },
  ollamaUnload: (params) => ipcRenderer.invoke('ollama-unload', params),
  ollamaModels: (params) => ipcRenderer.invoke('ollama-models', params),
  ollamaModelInfo: (params) => ipcRenderer.invoke('ollama-model-info', params),
  
  // Session Management
  saveSession: (sessionId, data) => ipcRenderer.invoke('save-session', { sessionId, data }),
  loadSession: (sessionId) => ipcRenderer.invoke('load-session', { sessionId }),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', { sessionId }),

  // Character Session Memory
  saveCharacterMemory: (characterId, sessionId, data) => ipcRenderer.invoke('save-character-memory', { characterId, sessionId, data }),
  loadCharacterMemory: (characterId, sessionId) => ipcRenderer.invoke('load-character-memory', { characterId, sessionId }),
  deleteCharacterMemory: (characterId, sessionId) => ipcRenderer.invoke('delete-character-memory', { characterId, sessionId }),

  // Settings
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  
  // Voice status change listener
  onVoiceStatusChanged: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('voice-status-changed', handler);
    return () => {
      ipcRenderer.removeListener('voice-status-changed', handler);
    };
  },

  // Settings updated listener
  onSettingsUpdated: (callback) => {
    const handler = (_event, settings) => callback(settings);
    ipcRenderer.on('settings-updated', handler);
    return () => {
      ipcRenderer.removeListener('settings-updated', handler);
    };
  },
  
  // v0.2.5: Multimedia IPC handlers
  imageGenModels: (params) => ipcRenderer.invoke('image-gen-models', params),
  testImageGen: (params) => ipcRenderer.invoke('test-image-gen', params),
  testVoice: (params) => ipcRenderer.invoke('test-voice', params),
  generateImage: (params) => ipcRenderer.invoke('generate-image', params),
  generateSpeech: (params) => ipcRenderer.invoke('generate-speech', params),

  // File dialog
  selectFile: (filters) => ipcRenderer.invoke('open-file-dialog', filters),
  
  // File check
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  
  // Voice model download
  downloadVoiceModel: (params) => ipcRenderer.invoke('download-voice-model', params),
  
  // Get local voice models
  getLocalVoiceModels: () => ipcRenderer.invoke('get-local-voice-models'),
  
  // ZONOS AUTO INSTALLER - True One-Click
  zonosAutoInstall: () => ipcRenderer.invoke('zonos-auto-install'),
  zonosCheckStatus: () => ipcRenderer.invoke('zonos-check-status'),
  zonosIsInstalled: () => ipcRenderer.invoke('zonos-is-installed'),
  zonosGetError: () => ipcRenderer.invoke('zonos-get-error'),
  zonosCancelInstall: () => ipcRenderer.invoke('zonos-cancel-install'),
  zonosGetProgress: () => ipcRenderer.invoke('zonos-get-progress'),
});
