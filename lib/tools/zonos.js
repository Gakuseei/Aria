const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isWindows, isMac, getPythonCommand, getVenvBinDir, getBinaryName, isPortInUse } = require('../platform');

const name = 'zonos';
const displayName = 'Zonos TTS';

const downloads = {
  win32: null,
  linux: null,
  darwin: null,
};

const REPO_URL = 'https://github.com/Zyphra/Zonos.git';
const SERVER_PORT = 7860;

let serverProcess = null;

function detect() {
  return new Promise((resolve) => {
    resolve(null); // Zonos isn't a PATH binary, needs settings path
  });
}

function _getVenvPython(zonosPath) {
  return path.join(zonosPath, 'venv', getVenvBinDir(), getBinaryName('python'));
}

function _checkCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (error) => resolve(!error));
  });
}

async function install(destPath, onProgress, abortController) {
  const zonosPath = path.join(destPath, 'Zonos');
  const pythonCmd = getPythonCommand();
  const venvPython = _getVenvPython(zonosPath);
  const venvPip = path.join(zonosPath, 'venv', getVenvBinDir(), getBinaryName('pip'));

  // Step 1: Check dependencies
  onProgress({ percent: 0, status: 'checking', message: 'Checking dependencies...' });

  const hasPython = await _checkCommand(`${pythonCmd} --version`);
  if (!hasPython) throw new Error('Python 3.10+ is required but not found. Install it from https://python.org/downloads/ and make sure it is in your PATH.');

  const hasGit = await _checkCommand('git --version');
  if (!hasGit) throw new Error('Git is required but not found. Install it from https://git-scm.com/downloads and restart the app.');

  // Step 2: Check espeak-ng
  onProgress({ percent: 5, status: 'checking', message: 'Checking espeak-ng...' });
  const hasEspeak = await _checkCommand('espeak-ng --version');
  if (!hasEspeak) {
    onProgress({ percent: 5, status: 'installing', message: 'Installing espeak-ng...' });
    if (isWindows()) {
      await new Promise((resolve, reject) => {
        const proc = exec('winget install --id espeak-ng.espeak-ng --silent', (error) => {
          if (abortController) abortController.signal.removeEventListener('abort', onAbort);
          if (error) reject(new Error('Failed to install espeak-ng automatically. Install it manually: Linux: "sudo apt install espeak-ng" or "sudo pacman -S espeak-ng", macOS: "brew install espeak-ng".'));
          else resolve();
        });
        const onAbort = () => proc.kill();
        if (abortController) {
          abortController.signal.addEventListener('abort', onAbort);
        }
      });
    } else {
      const installCmds = isMac()
        ? ['brew install espeak-ng']
        : ['apt-get install -y espeak-ng', 'pacman -S --noconfirm espeak-ng'];
      let installed = false;
      for (const cmd of installCmds) {
        try {
          await new Promise((resolve, reject) => {
            const proc = exec(cmd, (error) => {
              if (abortController) abortController.signal.removeEventListener('abort', onAbort);
              error ? reject(error) : resolve();
            });
            const onAbort = () => proc.kill();
            if (abortController) {
              abortController.signal.addEventListener('abort', onAbort);
            }
          });
          installed = true;
          break;
        } catch { /* try next */ }
      }
      if (!installed) throw new Error('Failed to install espeak-ng automatically. Install it manually: Linux: "sudo apt install espeak-ng" or "sudo pacman -S espeak-ng", macOS: "brew install espeak-ng".');
    }
  }

  // Step 3: Clone repo
  onProgress({ percent: 10, status: 'downloading', message: 'Cloning Zonos repository...' });
  fs.mkdirSync(destPath, { recursive: true });

  if (!fs.existsSync(zonosPath)) {
    await new Promise((resolve, reject) => {
      const proc = exec(`git clone ${REPO_URL} "${zonosPath}"`, (error) => {
        if (abortController) abortController.signal.removeEventListener('abort', onAbort);
        if (error) reject(new Error('Failed to download Zonos repository. Check your internet connection and try again.'));
        else resolve();
      });
      const onAbort = () => proc.kill();
      if (abortController) {
        abortController.signal.addEventListener('abort', onAbort);
      }
    });
  }

  // Step 4: Create venv
  onProgress({ percent: 30, status: 'installing', message: 'Creating Python virtual environment...' });
  if (!fs.existsSync(venvPython)) {
    await new Promise((resolve, reject) => {
      const proc = exec(`${pythonCmd} -m venv "${path.join(zonosPath, 'venv')}"`, (error) => {
        if (abortController) abortController.signal.removeEventListener('abort', onAbort);
        if (error) reject(new Error('Failed to create Python virtual environment. Make sure Python 3.10+ is installed correctly.'));
        else resolve();
      });
      const onAbort = () => proc.kill();
      if (abortController) {
        abortController.signal.addEventListener('abort', onAbort);
      }
    });
  }

  // Step 5: Install PyTorch
  onProgress({ percent: 40, status: 'installing', message: 'Installing PyTorch (2-3GB download)...' });
  const torchCmd = isMac()
    ? `"${venvPip}" install torch`
    : `"${venvPip}" install torch --index-url https://download.pytorch.org/whl/cu121`;
  await new Promise((resolve, reject) => {
    const proc = exec(
      torchCmd,
      { cwd: zonosPath, timeout: 600000 },
      (error) => {
        if (abortController) abortController.signal.removeEventListener('abort', onAbort);
        if (error) reject(new Error('Failed to install PyTorch. This requires ~2-3GB of disk space and a stable internet connection.'));
        else resolve();
      }
    );
    const onAbort = () => proc.kill();
    if (abortController) {
      abortController.signal.addEventListener('abort', onAbort);
    }
  });

  // Step 6: Install Zonos + deps
  onProgress({ percent: 70, status: 'installing', message: 'Installing Zonos packages...' });
  await new Promise((resolve, reject) => {
    const proc = exec(
      `"${venvPip}" install -e . && "${venvPip}" install flask flask-cors espeakng`,
      { cwd: zonosPath, timeout: 300000 },
      (error) => {
        if (abortController) abortController.signal.removeEventListener('abort', onAbort);
        if (error) reject(new Error('Failed to install Zonos dependencies. Check the terminal output for specific errors.'));
        else resolve();
      }
    );
    const onAbort = () => proc.kill();
    if (abortController) {
      abortController.signal.addEventListener('abort', onAbort);
    }
  });

  onProgress({ percent: 100, status: 'complete', message: 'Zonos installed' });
}

async function startServer(zonosPath) {
  const venvPython = _getVenvPython(zonosPath);
  const serverScript = path.join(zonosPath, '..', '..', 'tools', 'zonos_api_server.py');

  if (await isPortInUse(SERVER_PORT)) {
    return { success: true, message: 'Server already running' };
  }

  serverProcess = spawn(venvPython, [serverScript], {
    cwd: zonosPath,
    detached: true,
    stdio: 'ignore',
  });

  serverProcess.unref();
  return { success: true, pid: serverProcess.pid };
}

function stopServer() {
  if (serverProcess) {
    try {
      // Kill the process group (negative PID) since it was spawned detached
      process.kill(-serverProcess.pid, 'SIGTERM');
    } catch { /* already dead */ }
    serverProcess = null;
  }
}

module.exports = { name, displayName, downloads, detect, install, startServer, stopServer, SERVER_PORT };
