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
  
  // Session Management
  saveSession: (params) => ipcRenderer.invoke('save-session', params),
  loadSession: (params) => ipcRenderer.invoke('load-session', params),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  deleteSession: (params) => ipcRenderer.invoke('delete-session', params),
  
  // Settings
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  
  // FIX 3: Voice status change listener
  onVoiceStatusChanged: (callback) => {
    ipcRenderer.on('voice-status-changed', (event, value) => callback(value));
    // Return cleanup function
    return () => {
      ipcRenderer.removeAllListeners('voice-status-changed');
    };
  },
  
  // FIX 1: Settings updated listener
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', (event, settings) => callback(settings));
    // Return cleanup function
    return () => {
      ipcRenderer.removeAllListeners('settings-updated');
    };
  },
  
  // API Key Check
  checkApiKey: () => ipcRenderer.invoke('check-api-key'),
  
  // VERSION 5.4: Multimedia IPC handlers
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
});
