const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const tools = new Map();

function registerTool(toolDef) {
  if (tools.has(toolDef.name)) {
    console.warn(`[toolManager] Overwriting existing tool: ${toolDef.name}`);
  }
  tools.set(toolDef.name, toolDef);
}

function getTool(name) {
  return tools.get(name) || null;
}

function getAllTools() {
  return Array.from(tools.values());
}

/**
 * Download a file with progress callback and redirect support.
 * @param {string} url
 * @param {string} destPath
 * @param {function} onProgress - called with { percent, downloaded, total }
 * @param {AbortController} [abortController]
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath, onProgress, abortController, _redirectCount = 0) {
  const MAX_REDIRECTS = 10;
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;

    const req = proto.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (_redirectCount >= MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`));
        }
        const redirectUrl = response.headers.location.startsWith('http')
          ? response.headers.location
          : new URL(response.headers.location, url).toString();
        return downloadFile(redirectUrl, destPath, onProgress, abortController, _redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      const total = parseInt(response.headers['content-length'], 10) || 0;
      let downloaded = 0;

      // Ensure directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const file = fs.createWriteStream(destPath);

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress) {
          onProgress({
            percent: total > 0 ? Math.round((downloaded / total) * 100) : -1,
            downloaded,
            total,
          });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        req.destroy();
        fs.unlink(destPath, () => {});
        reject(new Error('Download cancelled'));
      });
    }
  });
}

module.exports = {
  registerTool,
  getTool,
  getAllTools,
  downloadFile,
};
