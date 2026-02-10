import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { clientId } from "../env/env";

// Zod schema for feature flags config: Record<string, boolean>
const FeatureFlagsSchema = z.record(z.string(), z.boolean(), {
  invalid_type_error:
    "Feature flags config must be an object with boolean values",
});

type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export type FeaturesApi = {
  isEnabled: (key: string) => boolean;
};

/**
 * Options for loading feature flags.
 */
export type LoadFeaturesOptions = {
  /** Project root directory (typically testInfo.config.rootDir). */
  rootDir: string;
  /** Environment name for override file (e.g., "staging", "prod"). */
  envName: string;
  /** Optional override for config directory. Defaults to `{rootDir}/test-data/configs`. */
  configDir?: string;
};

/**
 * Loads and validates a JSON feature flags file.
 * If file doesn't exist, returns empty object (optional config).
 * If file exists but is invalid, throws with clear error message.
 */
function loadAndValidateConfig(filePath: string): FeatureFlags {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    throw new Error(
      `[Features] Failed to read config file at "${filePath}": ${(e as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (e) {
    throw new Error(
      `[Features] Invalid JSON in config file at "${filePath}": ${(e as Error).message}`,
    );
  }

  const result = FeatureFlagsSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue: z.ZodIssue) => {
        const issuePath =
          issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
        return `  - config${issuePath}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(
      `[Features] Invalid features config at "${filePath}":\n${errors}\n` +
        `Expected: { "featureName": true/false, ... }`,
    );
  }

  return result.data;
}

/**
 * Resolves the path to features config file deterministically.
 * Uses only the explicit rootDir — no __dirname or process.cwd() fallbacks.
 */
function resolveConfigDir(rootDir: string, configDir?: string): string {
  return configDir ?? path.join(rootDir, "test-data", "configs");
}

/**
 * Loads feature flags from config file with environment-specific overrides.
 *
 * Resolution is deterministic: `{configDir}/features.config.json` with no
 * fallback scanning. configDir defaults to `{rootDir}/test-data/configs`.
 *
 * @param options - rootDir, envName, and optional configDir override
 * @returns FeaturesApi with isEnabled() method
 *
 * @throws Error if any config file exists but contains invalid JSON or schema
 */
export function loadFeatures(options: LoadFeaturesOptions): FeaturesApi {
  const { rootDir, envName, configDir } = options;

  const dir = resolveConfigDir(rootDir, configDir);
  const basePath = path.join(dir, "features.config.json");
  const baseFlags = loadAndValidateConfig(basePath);

  // Load environment-specific overrides if envName is not "default"
  let envFlags: FeatureFlags = {};
  if (envName && envName !== "default") {
    const envPath = path.join(dir, `features.${envName}.config.json`);
    envFlags = loadAndValidateConfig(envPath);
  }

  // Load client-specific overrides (CLIENT_ID or TENANT)
  let clientFlags: FeatureFlags = {};
  const client = clientId();
  if (client) {
    const clientPath = path.join(dir, `features.${client}.config.json`);
    clientFlags = loadAndValidateConfig(clientPath);
  }

  // Merge: base < env < client (client wins)
  const merged = { ...baseFlags, ...envFlags, ...clientFlags };

  return {
    isEnabled: (key: string): boolean => Boolean(merged[key]),
  };
}
