// Structured logger. Replaces ad-hoc console.log/warn/error scattered across
// the API layer (80+ sites) with a JSON-line format in production and a
// readable text format in development. Redacts keys that commonly carry
// secrets before they leave the process, so logs are safe to ship to a log
// sink without leaking tokens.
//
// Kept deliberately small — no pino, no transports. Rotate to pino if the
// workflow ever needs streams, levels-by-module, or async redaction.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

const SENSITIVE_KEY_RE =
  /^(password|passwordhash|token|secret|authorization|auth|totpsecret|apikey|api_key|refreshtoken|refresh_token|accesstoken|access_token|cookie|session|clientsecret|client_secret)$/i;

const REDACTED = '[REDACTED]';

export function redactSecrets(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // Guard against circular refs so callers can log any object safely.
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? REDACTED : redactSecrets(v, seen);
  }
  return out;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentMinLevel(): number {
  const env = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (env in LEVEL_PRIORITY) return LEVEL_PRIORITY[env];
  return process.env.NODE_ENV === 'production' ? LEVEL_PRIORITY.info : LEVEL_PRIORITY.debug;
}

function emit(level: LogLevel, context: string, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < currentMinLevel()) return;
  const safeMeta = meta ? (redactSecrets(meta) as Record<string, unknown>) : undefined;
  const record = { time: new Date().toISOString(), level, context, msg, ...safeMeta };

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (process.env.NODE_ENV === 'production') {
    sink(JSON.stringify(record));
  } else {
    sink(`[${level}] ${context}: ${msg}`, safeMeta ?? '');
  }
}

export function createLogger(context: string): Logger {
  return {
    debug: (msg, meta) => emit('debug', context, msg, meta),
    info: (msg, meta) => emit('info', context, msg, meta),
    warn: (msg, meta) => emit('warn', context, msg, meta),
    error: (msg, meta) => emit('error', context, msg, meta),
  };
}
