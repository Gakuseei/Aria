const net = require('net');

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

module.exports = {
  isWindows,
  isLinux,
  isMac,
  getPythonCommand,
  getVenvBinDir,
  getBinaryName,
  isPortInUse,
};
