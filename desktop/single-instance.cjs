function useSingleInstance(app, { currentWindow, createWindow }) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    const window = currentWindow();
    if (!window || window.isDestroyed()) { createWindow(); return; }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  return true;
}

module.exports = { useSingleInstance };
