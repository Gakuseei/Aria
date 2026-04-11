function isWaylandSession(platformName = process.platform, env = process.env) {
  if (platformName !== 'linux' || !env || typeof env !== 'object') {
    return false;
  }

  const sessionType = typeof env.XDG_SESSION_TYPE === 'string' ? env.XDG_SESSION_TYPE.trim().toLowerCase() : '';
  const waylandDisplay = typeof env.WAYLAND_DISPLAY === 'string' ? env.WAYLAND_DISPLAY.trim() : '';
  const ozonePlatform = typeof env.OZONE_PLATFORM === 'string' ? env.OZONE_PLATFORM.trim().toLowerCase() : '';
  const ozonePlatformHint = typeof env.ELECTRON_OZONE_PLATFORM_HINT === 'string'
    ? env.ELECTRON_OZONE_PLATFORM_HINT.trim().toLowerCase()
    : '';

  if (ozonePlatform === 'x11' || ozonePlatformHint === 'x11') {
    return false;
  }

  return ozonePlatform === 'wayland'
    || ozonePlatformHint === 'wayland'
    || sessionType === 'wayland'
    || Boolean(waylandDisplay);
}

module.exports = {
  isWaylandSession,
};
