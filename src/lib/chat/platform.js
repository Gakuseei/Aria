export function isElectron() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}
