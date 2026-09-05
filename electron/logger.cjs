const fs = require('node:fs');
const path = require('node:path');

const MAX_LOG_BYTES = 2 * 1024 * 1024;

function safeDetails(details) {
  if (details instanceof Error) return { name: details.name, message: details.message, stack: details.stack };
  if (details && typeof details === 'object') return details;
  return { value: String(details ?? '') };
}

function createLogger(userDataPath) {
  const logDirectory = path.join(userDataPath, 'logs');
  const logPath = path.join(logDirectory, 'app.log');

  function write(level, event, details = {}) {
    try {
      fs.mkdirSync(logDirectory, { recursive: true });
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
        fs.copyFileSync(logPath, path.join(logDirectory, 'app.previous.log'));
        fs.truncateSync(logPath, 0);
      }
      fs.appendFileSync(logPath, `${JSON.stringify({ time: new Date().toISOString(), level, event, ...safeDetails(details) })}\n`, 'utf8');
    } catch {
      // Logging must never be able to terminate the desktop application.
    }
  }

  return {
    logPath,
    info: (event, details) => write('info', event, details),
    error: (event, details) => write('error', event, details)
  };
}

module.exports = { MAX_LOG_BYTES, createLogger };
