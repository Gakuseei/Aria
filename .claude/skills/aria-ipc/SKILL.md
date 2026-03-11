---
name: aria-ipc
description: Create or modify Electron IPC handlers. Use when adding new IPC channels, bridging main-to-renderer communication, or debugging IPC issues. Covers main.js handlers, preload.js bridge, and the required return format.
---

# Aria IPC Pattern

All filesystem and AI calls from React must go through Electron IPC. Never import `fs`, `path`, or Node APIs directly in renderer code.

## Naming Convention

| File | Convention | Example |
|------|-----------|---------|
| `main.js` | **kebab-case** | `ipcMain.handle('save-session', ...)` |
| `preload.js` | **camelCase** | `saveSession: (id, data) => ipcRenderer.invoke('save-session', ...)` |

The kebab-case channel name in `main.js` must match exactly what `preload.js` invokes.

## Return Format

Every `ipcMain.handle` must return this shape:

```js
{ success: true, ...data }    // on success
{ success: false, error: "message" }  // on failure
```

## Handler Template

### main.js

```js
ipcMain.handle('my-new-handler', async (event, params) => {
  try {
    // ... do work
    return { success: true, result: data };
  } catch (error) {
    console.error('[my-new-handler]', error);
    return { success: false, error: error.message };
  }
});
```

### preload.js

```js
myNewHandler: (params) => ipcRenderer.invoke('my-new-handler', params),
```

### React usage

```js
const result = await window.electronAPI.myNewHandler(params);
if (!result.success) { /* handle error */ }
```

## Rules

- Use `ipcRenderer.invoke` / `ipcMain.handle` for request-response.
- Use `ipcRenderer.send` / `ipcMain.on` only for fire-and-forget (window controls).
- Wrap handler bodies in try-catch. Cleanup in `finally` if needed.
- Never expose `ipcRenderer` directly — only through `contextBridge.exposeInMainWorld`.
