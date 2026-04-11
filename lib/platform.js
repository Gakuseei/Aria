const { execFile } = require('child_process');
const net = require('net');
const { isWaylandSession: detectWaylandSession } = require('./windowChrome');

function isWindows() {
  return process.platform === 'win32';
}

function isLinux() {
  return process.platform === 'linux';
}

function isMac() {
  return process.platform === 'darwin';
}

function isWaylandSession(env = process.env) {
  return detectWaylandSession(process.platform, env);
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

function getFirstExecutablePath(output) {
  if (!output || !output.trim()) {
    return null;
  }

  const firstPath = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstPath || null;
}

function getExecutablePathFromCommand(command, args = []) {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }

      resolve(getFirstExecutablePath(stdout));
    });
  });
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
  isWaylandSession,
  getPythonCommand,
  getVenvBinDir,
  getBinaryName,
  getFirstExecutablePath,
  getExecutablePathFromCommand,
  isPortInUse,
};
