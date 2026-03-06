const net = require('net');
const path = require('path');
const os = require('os');

function getPlatform() {
  return process.platform;
}

function isWindows() {
  return process.platform === 'win32';
}

function isLinux() {
  return process.platform === 'linux';
}

function isMac() {
  return process.platform === 'darwin';
}

function getPythonCommand() {
  return isWindows() ? 'python' : 'python3';
}

function getVenvBinDir() {
  return isWindows() ? 'Scripts' : 'bin';
}

function getBinaryName(name) {
  return isWindows() ? `${name}.exe` : name;
}

function getDefaultToolsDir() {
  if (isWindows()) {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Aria', 'tools');
  } else if (isMac()) {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Aria', 'tools');
  } else {
    return path.join(os.homedir(), '.local', 'share', 'aria', 'tools');
  }
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

function killProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  getPlatform,
  isWindows,
  isLinux,
  isMac,
  getPythonCommand,
  getVenvBinDir,
  getBinaryName,
  getDefaultToolsDir,
  isPortInUse,
  killProcess,
};
