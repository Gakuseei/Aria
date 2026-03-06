const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isWindows, isLinux, isMac, getBinaryName } = require('../platform');
const { downloadFile } = require('../toolManager');

const name = 'stability';
const displayName = 'Stability Matrix';

const downloads = {
  win32: 'https://github.com/LykosAI/StabilityMatrix/releases/latest/download/StabilityMatrix-win-x64.zip',
  linux: 'https://github.com/LykosAI/StabilityMatrix/releases/latest/download/StabilityMatrix-linux-x64.zip',
  darwin: 'https://github.com/LykosAI/StabilityMatrix/releases/latest/download/StabilityMatrix-macos-arm64.dmg',
};

function detect() {
  return new Promise((resolve) => {
    const binaryName = getBinaryName('StabilityMatrix');
    const cmd = isWindows() ? `where ${binaryName}` : `which ${binaryName}`;
    exec(cmd, (error, stdout) => {
      if (!error && stdout.trim()) {
        resolve(stdout.trim().split('\n')[0]);
      } else {
        resolve(null);
      }
    });
  });
}

async function install(destPath, onProgress, abortController) {
  const platform = process.platform;
  const url = downloads[platform];
  if (!url) throw new Error(`Unsupported platform: ${platform}`);

  fs.mkdirSync(destPath, { recursive: true });

  if (isMac()) {
    const dmgPath = path.join(destPath, 'StabilityMatrix.dmg');
    onProgress({ percent: 0, status: 'downloading', message: 'Downloading Stability Matrix...' });
    await downloadFile(url, dmgPath, (p) => {
      onProgress({ percent: Math.round(p.percent * 0.8), status: 'downloading', message: `Downloading... ${p.percent}%` });
    }, abortController);
    onProgress({ percent: 80, status: 'installing', message: 'Opening installer...' });
    await new Promise((resolve, reject) => {
      exec(`open "${dmgPath}"`, (error) => error ? reject(error) : resolve());
    });
    onProgress({ percent: 100, status: 'complete', message: 'Stability Matrix DMG opened' });
  } else {
    const zipPath = path.join(destPath, 'StabilityMatrix.zip');
    onProgress({ percent: 0, status: 'downloading', message: 'Downloading Stability Matrix...' });
    await downloadFile(url, zipPath, (p) => {
      onProgress({ percent: Math.round(p.percent * 0.7), status: 'downloading', message: `Downloading... ${p.percent}%` });
    }, abortController);

    onProgress({ percent: 70, status: 'installing', message: 'Extracting...' });
    const extractCmd = isWindows()
      ? `powershell -Command "Expand-Archive -Force '${zipPath}' '${destPath}'"`
      : `unzip -o "${zipPath}" -d "${destPath}"`;

    await new Promise((resolve, reject) => {
      exec(extractCmd, (error) => error ? reject(error) : resolve());
    });

    fs.unlink(zipPath, () => {});
    onProgress({ percent: 100, status: 'complete', message: 'Stability Matrix installed' });
  }
}

module.exports = { name, displayName, downloads, detect, install };
