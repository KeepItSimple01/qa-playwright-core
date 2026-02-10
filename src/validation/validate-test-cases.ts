/**
 * Test-case JSON schema validator.
 *
 * Provides:
 * - `validateTestCases()` — programmatic API for use in code / CI gates
 * - `main()` — CLI entry invoked by `bin/pw-core.js`
 *
 * Schemas are shipped inside the package (`schemas/` directory)
 * and resolved relative to the compiled output at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import Ajv, { type ErrorObject, type AnySchema } from "ajv";

// ─── Schema file names ──────────────────────────────────────────────────────

const TEST_CASES_SCHEMA_FILE = "test-cases.schema.json";
const TEST_CASE_SCHEMA_FILE = "test-case.schema.json";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadJsonFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

function formatError(err: ErrorObject): string {
  const location = err.instancePath || "(root)";
  const message = err.message || "Unknown error";
  const schemaPath = err.schemaPath || "";
  return `  - ${location}: ${message} [${schemaPath}]`;
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidateTestCasesOptions {
  /** Absolute path to the JSON file to validate. */
  inputFile: string;
  /**
   * Absolute path to the directory containing the schema files.
   * Defaults to the `schemas/` directory shipped with this package.
   */
  schemasDir?: string;
}

// ─── Programmatic API ────────────────────────────────────────────────────────

/**
 * Resolve the default schemas directory shipped with this package.
 *
 * At runtime the compiled JS lives at `dist/validation/validate-test-cases.js`,
 * so `../../schemas` reaches `<package-root>/schemas/`.
 */
function defaultSchemasDir(): string {
  return path.resolve(__dirname, "..", "..", "schemas");
}

/**
 * Validate a test-cases JSON file against the shipped JSON schemas.
 *
 * @returns A `ValidationResult` with `valid` flag and human-readable `errors`.
 */
export function validateTestCases(
  options: ValidateTestCasesOptions,
): ValidationResult {
  const { inputFile, schemasDir = defaultSchemasDir() } = options;

  // ── Check input file ────────────────────────────────────────────────────
  if (!fs.existsSync(inputFile)) {
    return { valid: false, errors: [`File not found: ${inputFile}`] };
  }

  let data: unknown;
  try {
    data = loadJsonFile(inputFile);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Invalid JSON in ${inputFile}: ${msg}`] };
  }

  // ── Load schemas ────────────────────────────────────────────────────────
  const testCasesSchemaPath = path.join(schemasDir, TEST_CASES_SCHEMA_FILE);
  const testCaseSchemaPath = path.join(schemasDir, TEST_CASE_SCHEMA_FILE);

  if (!fs.existsSync(testCasesSchemaPath)) {
    return {
      valid: false,
      errors: [`Schema not found: ${testCasesSchemaPath}`],
    };
  }
  if (!fs.existsSync(testCaseSchemaPath)) {
    return {
      valid: false,
      errors: [`Schema not found: ${testCaseSchemaPath}`],
    };
  }

  let testCasesSchema: AnySchema;
  let testCaseSchema: AnySchema;
  try {
    testCasesSchema = loadJsonFile(testCasesSchemaPath) as AnySchema;
    testCaseSchema = loadJsonFile(testCaseSchemaPath) as AnySchema;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Failed to load schemas: ${msg}`] };
  }

  // ── Validate with AJV ──────────────────────────────────────────────────
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addSchema(testCaseSchema, TEST_CASE_SCHEMA_FILE);
  const validate = ajv.compile(testCasesSchema);
  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors || []).map(formatError);
  return { valid: false, errors };
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

/**
 * CLI main — called from `bin/pw-core.js validate-test-cases <file>`.
 *
 * Takes an explicit file path as argument. Never assumes repo root.
 * Optional `--schemas-dir <dir>` flag to override bundled schemas.
 */
export function main(argv: string[] = process.argv.slice(2)): void {
  let inputFile: string | undefined;
  let schemasDir: string | undefined;

  // Simple arg parsing (no dependency needed)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--schemas-dir" && argv[i + 1]) {
      schemasDir = path.resolve(argv[i + 1]);
      i++; // skip next
    } else if (!argv[i].startsWith("-")) {
      inputFile = path.resolve(argv[i]);
    }
  }

  if (!inputFile) {
    console.error(
      "Usage: pw-core validate-test-cases <file> [--schemas-dir <dir>]",
    );
    process.exitCode = 1;
    return;
  }

  const result = validateTestCases({ inputFile, schemasDir });

  if (result.valid) {
    console.log(`\u2713 ${inputFile} is valid`);
    process.exitCode = 0;
  } else {
    console.error(`\u2717 ${inputFile} is invalid`);
    console.error(`  ${result.errors.length} error(s) found:\n`);
    for (const err of result.errors) {
      console.error(err);
    }
    process.exitCode = 1;
  }
}