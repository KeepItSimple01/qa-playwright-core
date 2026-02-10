/**
 * Only test-lib/shared/env/env.ts is allowed to read process.env.
 * Everything else imports from it.
 *
 * This module validates all environment variables at import time using Zod.
 * If validation fails, the process will fail fast with a clear error message.
 */

// eslint-disable no-process-env

import { z } from "zod";

// Schema for individual user credentials
const UserCredSchema = z.object({
  username: z
    .string({ required_error: "username is required" })
    .min(1, "username cannot be empty"),
  password: z
    .string({ required_error: "password is required" })
    .min(1, "password cannot be empty"),
});

export type UserCred = z.infer<typeof UserCredSchema>;

// Schema for the E2E_USERS_JSON array
const UsersArraySchema = z
  .array(UserCredSchema, {
    required_error: "E2E_USERS_JSON must be a JSON array",
    invalid_type_error: "E2E_USERS_JSON must be a JSON array",
  })
  .min(1, "E2E_USERS_JSON must contain at least one user credential");

// Helper to coerce string to boolean for CI-like env vars
const booleanString = z
  .string()
  .optional()
  .transform((val: string | undefined) => {
    if (val === undefined || val.trim() === "") return false;
    const normalized = val.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
    return false;
  });

// Schema for raw environment variables
const RawEnvSchema = z.object({
  // Required
  E2E_USERS_JSON: z
    .string({
      required_error:
        "[ENV] Missing required environment variable: E2E_USERS_JSON. " +
        'Set it to a JSON array like: [{"username":"user@example.com","password":"secret"}]',
    })
    .min(1, {
      message:
        "[ENV] E2E_USERS_JSON cannot be empty. " +
        'Set it to a JSON array like: [{"username":"user@example.com","password":"secret"}]',
    }),

  // Optional with defaults
  TEST_ENV: z.string().optional().default("default"),
  LANG: z.string().optional(),
  AUTH_DIR: z.string().optional(),

  // Client/tenant identity (optional)
  CLIENT_ID: z.string().optional(),
  TENANT: z.string().optional(),

  // URLs (optional)
  BASE_URL: z.string().optional(),
  BASE_IAM_URL: z.string().optional(),

  // Debug toggle (optional)
  DEBUG_UI: booleanString,

  // Logger configuration (optional)
  // LOG_LEVEL: trace | debug | info | warn | error (default: info)
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .optional()
    .default("info"),
  // DEBUG: shortcut to enable debug level logging
  DEBUG: booleanString,
  // NO_COLOR: disable colored output (standard convention)
  NO_COLOR: booleanString,

  // CI detection (optional, coerce to boolean)
  CI: booleanString,

  // ENV_FILE for dotenv (used in playwright.config.ts before this module loads)
  ENV_FILE: z.string().optional(),
});

// Parse and validate raw environment variables
function parseEnv(): z.infer<typeof RawEnvSchema> {
  const result = RawEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue: z.ZodIssue) => {
        const path = issue.path.join(".");
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(
      `[ENV] Environment variable validation failed:\n${errors}`,
    );
  }

  return result.data;
}

// Parse E2E_USERS_JSON string into validated user credentials array
function parseUsersJson(jsonString: string): UserCred[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(
      `[ENV] E2E_USERS_JSON must be valid JSON. ` +
        `Parse error: ${(e as Error).message}. ` +
        `Received: "${jsonString.substring(0, 100)}${jsonString.length > 100 ? "..." : ""}"`,
    );
  }

  const result = UsersArraySchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue: z.ZodIssue) => {
        const path = issue.path.length > 0 ? `[${issue.path.join(".")}]` : "";
        return `  - E2E_USERS_JSON${path}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`[ENV] E2E_USERS_JSON validation failed:\n${errors}`);
  }

  return result.data;
}

// Execute validation at module import time
const rawEnv = parseEnv();
const users = parseUsersJson(rawEnv.E2E_USERS_JSON);

// Helper to get optional string, treating empty as undefined
function optionalString(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}

export const ENV = Object.freeze({
  // core
  TEST_ENV: rawEnv.TEST_ENV ?? "default",
  LANG: optionalString(rawEnv.LANG),
  AUTH_DIR: optionalString(rawEnv.AUTH_DIR),

  // URLs (optional with defaults in routes.ts)
  BASE_URL: optionalString(rawEnv.BASE_URL),
  BASE_IAM_URL: optionalString(rawEnv.BASE_IAM_URL),

  // client / tenant identity (optional)
  CLIENT_ID: optionalString(rawEnv.CLIENT_ID),
  TENANT: optionalString(rawEnv.TENANT),

  // required structured secrets
  E2E_USERS: users,

  // toggles
  DEBUG_UI: rawEnv.DEBUG_UI ?? false,

  // logger configuration
  LOG_LEVEL: rawEnv.LOG_LEVEL ?? "info",
  DEBUG: rawEnv.DEBUG ?? false,
  NO_COLOR: rawEnv.NO_COLOR ?? false,

  // CI detection
  CI: rawEnv.CI ?? false,
} as const);

export function clientId(): string | undefined {
  return ENV.CLIENT_ID ?? ENV.TENANT;
}

/**
 * Picks a credential from ENV.E2E_USERS by index.
 * Throws if index is out of bounds.
 */
export function pickCred(index: number): UserCred {
  if (index < 0 || index >= ENV.E2E_USERS.length) {
    throw new Error(
      `No credential at index ${index}. Pool size=${ENV.E2E_USERS.length}.`,
    );
  }
  return ENV.E2E_USERS[index];
}
