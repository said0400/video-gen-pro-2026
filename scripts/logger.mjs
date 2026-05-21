import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');
const LOG_DIR    = path.join(ROOT_DIR, 'logs');

// ============================
// ✅ الإعدادات
// ============================
const CONFIG = {
  maxLogFileSizeMB : 10,      // الحد الأقصى لحجم ملف الـ log
  maxLogFiles      : 7,       // عدد ملفات الـ log المحفوظة
  debugMode        : process.env.DEBUG_MODE === 'true',
  logToFile        : process.env.LOG_TO_FILE !== 'false',  // true افتراضياً
};

// ============================
// ✅ الألوان
// ============================
const COLORS = {
  ERROR   : '\x1b[31m',   // أحمر
  WARN    : '\x1b[33m',   // أصفر
  INFO    : '\x1b[36m',   // أزرق سماوي
  DEBUG   : '\x1b[35m',   // بنفسجي
  SUCCESS : '\x1b[32m',   // أخضر
  SECTION : '\x1b[34m',   // أزرق غامق
  RESET   : '\x1b[0m',
};

// ============================
// ✅ إدارة ملفات السجل
// ============================
class LogFileManager {
  constructor() {
    this._logFile  = null;
    this._ready    = false;
    this._queue    = [];       // ✅ queue للكتابة غير المتزامنة
    this._writing  = false;
  }

  // ✅ التهيئة الكسولة (lazy) - عند أول استخدام
  _ensureReady() {
    if (this._ready) return;

    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }

      const date    = new Date().toISOString().split('T')[0];
      this._logFile = path.join(LOG_DIR, `video-gen-${date}.log`);

      // ✅ تحقق من الحجم - إذا كبير جداً أنشئ ملف جديد
      if (fs.existsSync(this._logFile)) {
        const stats   = fs.statSync(this._logFile);
        const sizeMB  = stats.size / 1024 / 1024;

        if (sizeMB >= CONFIG.maxLogFileSizeMB) {
          const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
          this._logFile    = path.join(LOG_DIR, `video-gen-${date}-${timestamp}.log`);
        }
      }

      this._ready = true;
      this._cleanOldLogs();

    } catch (err) {
      // ✅ لو فشل إنشاء مجلد اللوق، لا نوقف البرنامج
      console.error(`⚠️ تعذر إنشاء مجلد السجلات: ${err.message}`);
      this._ready   = true;   // نكمل بدون كتابة ملف
      this._logFile = null;
    }
  }

  // ✅ حذف الملفات القديمة
  _cleanOldLogs() {
    try {
      const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('video-gen-') && f.endsWith('.log'))
        .map(f => ({
          name : f,
          path : path.join(LOG_DIR, f),
          time : fs.statSync(path.join(LOG_DIR, f)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time);  // الأحدث أولاً

      // ✅ احذف الزيادة عن الحد
      files.slice(CONFIG.maxLogFiles).forEach(f => {
        fs.unlinkSync(f.path);
      });
    } catch {
      // تجاهل أخطاء التنظيف
    }
  }

  // ✅ كتابة غير متزامنة مع Queue
  write(text) {
    if (!CONFIG.logToFile) return;

    this._ensureReady();
    if (!this._logFile) return;

    this._queue.push(text + '\n');
    this._flush();
  }

  async _flush() {
    if (this._writing || this._queue.length === 0) return;
    this._writing = true;

    while (this._queue.length > 0) {
      const batch = this._queue.splice(0, 10).join('');  // ✅ كتابة دفعة دفعة
      try {
        await fs.promises.appendFile(this._logFile, batch);
      } catch (err) {
        console.error(`⚠️ خطأ في كتابة السجل: ${err.message}`);
      }
    }

    this._writing = false;
  }

  // ✅ كتابة إجبارية عند انتهاء البرنامج
  async flushSync() {
    if (this._queue.length === 0 || !this._logFile) return;
    const remaining = this._queue.splice(0).join('');
    try {
      fs.appendFileSync(this._logFile, remaining);
    } catch { /* تجاهل */ }
  }

  getLogFile() {
    this._ensureReady();
    return this._logFile;
  }
}

const logManager = new LogFileManager();

// ✅ كتابة ما تبقى عند إغلاق البرنامج
process.on('exit',    () => logManager.flushSync());
process.on('SIGINT',  () => { logManager.flushSync(); process.exit(0); });
process.on('SIGTERM', () => { logManager.flushSync(); process.exit(0); });

// ============================
// ✅ تنسيق البيانات بأمان
// ============================
function safeStringify(data) {
  if (data === null || data === undefined) return '';

  try {
    // ✅ معالجة circular references
    const seen = new WeakSet();
    return JSON.stringify(data, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      // ✅ إخفاء القيم الحساسة
      if (['key', 'password', 'token', 'secret', 'api_key'].some(
        k => key.toLowerCase().includes(k)
      )) {
        return '***';
      }
      return value;
    });
  } catch {
    return String(data);
  }
}

// ============================
// ✅ تنسيق رسالة الـ Log
// ============================
function formatLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const dataStr   = data ? ' ' + safeStringify(data) : '';
  const logString = `[${timestamp}] [${level}] ${message}${dataStr}`;

  return { logString, timestamp };
}

// ============================
// ✅ Logger الرئيسي
// ============================
export const logger = {

  error: (message, data = null) => {
    const { logString } = formatLog('ERROR', message, data);
    console.error(`${COLORS.ERROR}${logString}${COLORS.RESET}`);
    logManager.write(logString);
  },

  warn: (message, data = null) => {
    const { logString } = formatLog('WARN', message, data);
    console.warn(`${COLORS.WARN}${logString}${COLORS.RESET}`);
    logManager.write(logString);
  },

  info: (message, data = null) => {
    const { logString } = formatLog('INFO', message, data);
    console.log(`${COLORS.INFO}${logString}${COLORS.RESET}`);
    logManager.write(logString);
  },

  // ✅ debug يرجع دائماً
  debug: (message, data = null) => {
    if (!CONFIG.debugMode) return;
    const { logString } = formatLog('DEBUG', message, data);
    console.log(`${COLORS.DEBUG}${logString}${COLORS.RESET}`);
    logManager.write(logString);
  },

  success: (message, data = null) => {
    const { logString } = formatLog('SUCCESS', message, data);
    console.log(`${COLORS.SUCCESS}${logString}${COLORS.RESET}`);
    logManager.write(logString);
  },

  section: (title) => {
    const sep     = '═'.repeat(60);
    const message = `\n${sep}\n  ${title}\n${sep}`;
    console.log(`${COLORS.SECTION}${message}${COLORS.RESET}`);
    logManager.write(message);
  },

  // ✅ دالة جديدة للـ table
  table: (data) => {
    console.table(data);
    logManager.write('[TABLE] ' + safeStringify(data));
  },

  // ✅ الحصول على مسار ملف الـ log
  getLogFile: () => logManager.getLogFile(),
};

// ============================
// ✅ handleError واضح ومحدد السلوك
// ============================
export function handleError(error, context = '') {
  const errorMessage = error.response?.data?.error?.message
    ?? error.response?.data?.message
    ?? error.message
    ?? 'Unknown error';

  const errorData = {
    context,
    message : errorMessage,
    status  : error.response?.status,
    url     : error.config?.url
      ? error.config.url.replace(/key=[^&]+/, 'key=***')  // ✅ إخفاء API key في الـ URL
      : undefined,
  };

  logger.error(`❌ خطأ في: ${context}`, errorData);

  // ✅ سلوك واضح - يُرجع فقط، لا يرمي
  // المُستدعي مسؤول عن throw إذا أراد
  return errorData;
}

// ============================
// ✅ دالة لقراءة آخر N سطر من الـ log
// ============================
export function getRecentLogs(lines = 50) {
  const logFile = logManager.getLogFile();
  if (!logFile || !fs.existsSync(logFile)) return [];

  try {
    const content = fs.readFileSync(logFile, 'utf8');
    return content.split('\n').filter(Boolean).slice(-lines);
  } catch {
    return [];
  }
}
