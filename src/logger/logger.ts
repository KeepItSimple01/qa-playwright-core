/**
 * Debug logger utility with colored console output.
 *
 * Supports:
 * - Log levels: trace, debug, info, warn, error
 * - Colored output (disable with NO_COLOR=1)
 * - Timestamps
 * - Context tags via createLogger("context")
 * - Environment-based configuration
 *
 * Environment variables:
 * - LOG_LEVEL: Minimum log level (trace|debug|info|warn|error). Default: "info"
 * - DEBUG: Set to "1" or "true" to enable debug level (shortcut)
 * - NO_COLOR: Set to "1" to disable colored output
 *
 * @example
 * ```typescript
 * import { logger, createLogger } from "@company/pw-core";
 *
 * // Direct usage
 * logger.info("Application started");
 * logger.debug("Processing request", { userId: 123 });
 *
 * // Scoped logger
 * const log = createLogger("auth");
 * log.info("User logged in"); // [auth] User logged in
 * log.error("Login failed", { reason: "invalid credentials" });
 * ```
 */

// =============================================================================
// ANSI Color Codes (no external dependencies)
// =============================================================================

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  // Foreground colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

// =============================================================================
// Types
// =============================================================================

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface Logger {
  trace: (message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

// =============================================================================
// Configuration (reads process.env directly - this is a logging utility)
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

function getLogLevel(): LogLevel {
  /* eslint-disable no-process-env */
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const debug = process.env.DEBUG;
  /* eslint-enable no-process-env */

  // DEBUG=1 or DEBUG=true enables debug level
  if (debug === "1" || debug?.toLowerCase() === "true") {
    return "debug";
  }

  // Explicit LOG_LEVEL takes precedence
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }

  // Default: info
  return "info";
}

function isColorEnabled(): boolean {
  /* eslint-disable no-process-env */
  const noColor = process.env.NO_COLOR;
  const forceColor = process.env.FORCE_COLOR;
  /* eslint-enable no-process-env */

  // NO_COLOR is a standard convention (https://no-color.org/)
  if (noColor === "1" || noColor?.toLowerCase() === "true") {
    return false;
  }

  // FORCE_COLOR overrides NO_COLOR detection
  if (forceColor === "1" || forceColor?.toLowerCase() === "true") {
    return true;
  }

  // Enable colors in TTY environments
  return process.stdout.isTTY ?? false;
}

// Cache config at module load (avoids repeated env reads)
const config = {
  level: getLogLevel(),
  useColor: isColorEnabled(),
};

// =============================================================================
// Formatting
// =============================================================================

function colorize(text: string, color: keyof typeof ANSI): string {
  if (!config.useColor) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function formatTimestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return colorize(`${hh}:${mm}:${ss}.${ms}`, "dim");
}

function formatLevel(level: LogLevel): string {
  const padded = level.toUpperCase().padEnd(5);
  switch (level) {
    case "trace":
      return colorize(padded, "gray");
    case "debug":
      return colorize(padded, "cyan");
    case "info":
      return colorize(padded, "green");
    case "warn":
      return colorize(padded, "yellow");
    case "error":
      return colorize(padded, "red");
    default:
      return padded;
  }
}

function formatContext(context?: string): string {
  if (!context) return "";
  return colorize(`[${context}]`, "magenta") + " ";
}

function formatData(data: unknown): string {
  if (data === undefined) return "";
  if (typeof data === "object" && data !== null) {
    try {
      return " " + JSON.stringify(data);
    } catch {
      return " [unserializable]";
    }
  }
  return " " + String(data);
}

// =============================================================================
// Core Logging
// =============================================================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[config.level];
}

function log(
  level: LogLevel,
  context: string | undefined,
  message: string,
  data?: unknown,
): void {
  if (!shouldLog(level)) return;

  const timestamp = formatTimestamp();
  const levelStr = formatLevel(level);
  const contextStr = formatContext(context);
  const dataStr = formatData(data);

  const output = `${timestamp} ${levelStr} ${contextStr}${message}${dataStr}`;

  // Use appropriate console method for the level
  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates a scoped logger with a context prefix.
 *
 * @param context - Context tag shown in log output (e.g., "auth", "i18n")
 * @returns Logger instance with context prefix
 *
 * @example
 * ```typescript
 * const log = createLogger("auth");
 * log.info("User logged in");  // 12:34:56.789 INFO  [auth] User logged in
 * log.debug("Token refreshed", { expiresIn: 3600 });
 * ```
 */
export function createLogger(context: string): Logger {
  return {
    trace: (message, data) => log("trace", context, message, data),
    debug: (message, data) => log("debug", context, message, data),
    info: (message, data) => log("info", context, message, data),
    warn: (message, data) => log("warn", context, message, data),
    error: (message, data) => log("error", context, message, data),
  };
}

/**
 * Global logger instance (no context prefix).
 *
 * @example
 * ```typescript
 * import { logger } from "@company/pw-core";
 *
 * logger.info("Application started");
 * logger.debug("Config loaded", { env: "staging" });
 * ```
 */
export const logger: Logger = {
  trace: (message, data) => log("trace", undefined, message, data),
  debug: (message, data) => log("debug", undefined, message, data),
  info: (message, data) => log("info", undefined, message, data),
  warn: (message, data) => log("warn", undefined, message, data),
  error: (message, data) => log("error", undefined, message, data),
};

/**
 * Returns the current log level configuration.
 * Useful for debugging or conditional logic based on verbosity.
 */
export function getEffectiveLogLevel(): LogLevel {
  return config.level;
}

/**
 * Returns whether colored output is enabled.
 */
export function isColoredOutput(): boolean {
  return config.useColor;
}
