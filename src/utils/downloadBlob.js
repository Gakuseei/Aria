/**
 * Trigger a browser download of a Blob via a temporary anchor element.
 * @param {Blob} blob - The blob to download
 * @param {string} filename - Suggested filename for the download
 */
export default function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
