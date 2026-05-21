import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, `video-gen-${new Date().toISOString().split('T')[0]}.log`);

// إنشاء مجلد السجلات إذا لم يكن موجوداً
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  SUCCESS: 'SUCCESS'
};

const COLORS = {
  ERROR: '\x1b[31m',      // أحمر
  WARN: '\x1b[33m',       // أصفر
  INFO: '\x1b[36m',       // أزرق
  DEBUG: '\x1b[35m',      // بنفسجي
  SUCCESS: '\x1b[32m',    // أخضر
  RESET: '\x1b[0m'
};

function formatLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data })
  };

  const logString = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
  return { logEntry, logString };
}

function writeLog(logString) {
  try {
    fs.appendFileSync(LOG_FILE, logString + '\n');
  } catch (err) {
    console.error('خطأ في كتابة السجل:', err.message);
  }
}

export const logger = {
  error: (message, data = null) => {
    const { logEntry, logString } = formatLog(LOG_LEVELS.ERROR, message, data);
    console.error(`${COLORS.ERROR}${logString}${COLORS.RESET}`);
    writeLog(logString);
    return logEntry;
  },

  warn: (message, data = null) => {
    const { logEntry, logString } = formatLog(LOG_LEVELS.WARN, message, data);
    console.warn(`${COLORS.WARN}${logString}${COLORS.RESET}`);
    writeLog(logString);
    return logEntry;
  },

  info: (message, data = null) => {
    const { logEntry, logString } = formatLog(LOG_LEVELS.INFO, message, data);
    console.log(`${COLORS.INFO}${logString}${COLORS.RESET}`);
    writeLog(logString);
    return logEntry;
  },

  debug: (message, data = null) => {
    if (process.env.DEBUG_MODE === 'true') {
      const { logEntry, logString } = formatLog(LOG_LEVELS.DEBUG, message, data);
      console.log(`${COLORS.DEBUG}${logString}${COLORS.RESET}`);
      writeLog(logString);
      return logEntry;
    }
  },

  success: (message, data = null) => {
    const { logEntry, logString } = formatLog(LOG_LEVELS.SUCCESS, message, data);
    console.log(`${COLORS.SUCCESS}${logString}${COLORS.RESET}`);
    writeLog(logString);
    return logEntry;
  },

  section: (title) => {
    const separator = '='.repeat(60);
    const message = `\n${separator}\n${title}\n${separator}`;
    console.log(`${COLORS.INFO}${message}${COLORS.RESET}`);
    writeLog(message);
  }
};

export function handleError(error, context = '') {
  const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
  const errorData = {
    context,
    message: errorMessage,
    status: error.response?.status,
    url: error.config?.url
  };

  logger.error(`❌ ${context}`, errorData);
  return errorData;
}
