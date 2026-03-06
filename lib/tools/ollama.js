const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isWindows, isLinux, isMac } = require('../platform');
const { downloadFile } = require('../toolManager');

const name = 'ollama';
const displayName = 'Ollama';

const downloads = {
  win32: 'https://ollama.com/download/OllamaSetup.exe',
  linux: 'https://ollama.com/install.sh',
  darwin: 'https://ollama.com/download/Ollama-darwin.zip',
};

function detect() {
  return new Promise((resolve) => {
    const cmd = isWindows() ? 'where ollama' : 'which ollama';
    exec(cmd, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim().split('\n')[0]);
      }
    });
  });
}

async function install(destPath, onProgress, abortController) {
  const platform = process.platform;
  const url = downloads[platform];

  if (!url) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  fs.mkdirSync(destPath, { recursive: true });

  if (isWindows()) {
    const installerPath = path.join(destPath, 'OllamaSetup.exe');
    onProgress({ percent: 0, status: 'downloading', message: 'Downloading Ollama installer...' });

    await downloadFile(url, installerPath, (p) => {
      onProgress({ percent: Math.round(p.percent * 0.8), status: 'downloading', message: `Downloading... ${p.percent}%` });
    }, abortController);

    onProgress({ percent: 80, status: 'installing', message: 'Running installer...' });

    await new Promise((resolve, reject) => {
      const proc = exec(`"${installerPath}" /VERYSILENT /NORESTART`, (error) => {
        if (error) reject(error);
        else resolve();
      });
      if (abortController) {
        abortController.signal.addEventListener('abort', () => proc.kill());
      }
    });

    fs.unlink(installerPath, () => {});
    onProgress({ percent: 100, status: 'complete', message: 'Ollama installed' });

  } else if (isLinux()) {
    const scriptPath = path.join(destPath, 'install.sh');
    onProgress({ percent: 0, status: 'downloading', message: 'Downloading install script...' });

    await downloadFile(url, scriptPath, (p) => {
      onProgress({ percent: Math.round(p.percent * 0.3), status: 'downloading', message: `Downloading... ${p.percent}%` });
    }, abortController);

    onProgress({ percent: 30, status: 'installing', message: 'Running installer (may ask for sudo)...' });

    await new Promise((resolve, reject) => {
      const proc = exec(`bash "${scriptPath}"`, (error) => {
        if (error) reject(error);
        else resolve();
      });
      if (abortController) {
        abortController.signal.addEventListener('abort', () => proc.kill());
      }
    });

    fs.unlink(scriptPath, () => {});
    onProgress({ percent: 100, status: 'complete', message: 'Ollama installed' });

  } else if (isMac()) {
    const zipPath = path.join(destPath, 'Ollama-darwin.zip');
    onProgress({ percent: 0, status: 'downloading', message: 'Downloading Ollama...' });

    await downloadFile(url, zipPath, (p) => {
      onProgress({ percent: Math.round(p.percent * 0.7), status: 'downloading', message: `Downloading... ${p.percent}%` });
    }, abortController);

    onProgress({ percent: 70, status: 'installing', message: 'Extracting...' });

    await new Promise((resolve, reject) => {
      exec(`unzip -o "${zipPath}" -d /Applications`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    fs.unlink(zipPath, () => {});
    onProgress({ percent: 100, status: 'complete', message: 'Ollama installed' });
  }
}

module.exports = { name, displayName, downloads, detect, install };
