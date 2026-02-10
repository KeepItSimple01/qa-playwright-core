#!/usr/bin/env node
"use strict";

/**
 * @company/pw-core CLI
 *
 * Usage:
 *   pw-core validate-test-cases <file> [--schemas-dir <dir>]
 *
 * Commands:
 *   validate-test-cases   Validate a test-cases JSON file against the schema
 */

const command = process.argv[2];

if (command === "validate-test-cases") {
  // Forward remaining args (skip "node bin/pw-core.js validate-test-cases")
  const { main } = require("../dist/validation/validate-test-cases");
  main(process.argv.slice(3));
} else {
  const known = ["validate-test-cases"];
  console.error(`Usage: pw-core <command> [options]\n`);
  console.error(`Commands:`);
  for (const cmd of known) {
    console.error(`  ${cmd}`);
  }
  if (command) {
    console.error(`\nUnknown command: ${command}`);
  }
  process.exitCode = 1;
}