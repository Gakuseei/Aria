const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isWindows, getBinaryName } = require('../platform');
const { downloadFile } = require('../toolManager');

const name = 'piper';
const displayName = 'Piper TTS';

const downloads = {
  win32: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
  linux: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz',
  darwin: null,
};

function detect() {
  return new Promise((resolve) => {
    const binaryName = getBinaryName('piper');
    const cmd = isWindows() ? `where ${binaryName}` : `which ${binaryName}`;
    exec(cmd, (error, stdout) => {
      if (!error && stdout.trim()) {
        resolve(stdout.trim().split('\n')[0]);
        return;
      }
      resolve(null);
    });
  });
}

async function install(destPath, onProgress, abortController) {
  const platform = process.platform;
  const url = downloads[platform];
  if (!url) throw new Error(`Piper TTS has no official ${platform === 'darwin' ? 'macOS' : platform} build. See https://github.com/rhasspy/piper for build instructions.`);

  const isZip = url.endsWith('.zip');
  const ext = isZip ? '.zip' : '.tar.gz';
  const archivePath = path.join(destPath, `piper${ext}`);

  fs.mkdirSync(destPath, { recursive: true });

  onProgress({ percent: 0, status: 'downloading', message: 'Downloading Piper...' });

  await downloadFile(url, archivePath, (p) => {
    onProgress({ percent: Math.round(p.percent * 0.7), status: 'downloading', message: `Downloading... ${p.percent}%` });
  }, abortController);

  onProgress({ percent: 70, status: 'installing', message: 'Extracting...' });

  await new Promise((resolve, reject) => {
    const cmd = isZip
      ? (isWindows()
        ? `powershell -Command "Expand-Archive -Force '${archivePath}' '${destPath}'"`
        : `unzip -o "${archivePath}" -d "${destPath}"`)
      : `tar -xzf "${archivePath}" -C "${destPath}"`;

    const proc = exec(cmd, (error) => {
      if (abortController) abortController.signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    });
    const onAbort = () => proc.kill();
    if (abortController) {
      abortController.signal.addEventListener('abort', onAbort);
    }
  });

  fs.unlink(archivePath, () => {});
  onProgress({ percent: 100, status: 'complete', message: 'Piper installed' });
}

module.exports = { name, displayName, downloads, detect, install };
