#!/usr/bin/env node
/**
 * scripts/phase17-set-gemini-key.js
 *
 * Upsert GEMINI_API_KEY into apps/backend/.env without ever printing
 * the value. Reads the key from the GEMINI_API_KEY environment
 * variable so it never touches shell history as a literal.
 *
 * Usage:
 *   GEMINI_API_KEY="AIzaSy..." node scripts/phase17-set-gemini-key.js
 *
 * Behaviour:
 *   - Creates apps/backend/.env if it doesn't exist (with a header).
 *   - Updates an existing GEMINI_API_KEY line, or appends a new one
 *     under a "# AI providers" section.
 *   - Preserves every other key, blank line, and comment in the file.
 *   - Idempotent: re-running with the same key reports "unchanged".
 *   - Never prints the key. Output shows length + SHA-256 fingerprint
 *     (first 8 hex chars) so you can verify "same key" across runs
 *     without the value ever leaving the process.
 *
 * Exit codes:
 *   0 — key applied (added / updated / unchanged)
 *   1 — GEMINI_API_KEY env var missing or looks invalid
 *   2 — filesystem error
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ENV_PATH = path.resolve(__dirname, '..', 'apps', 'backend', '.env');
const KEY_NAME = 'GEMINI_API_KEY';
const AI_SECTION_HEADER = '# AI providers';

// -----------------------------------------------------------------
// 1. Read + validate env var
// -----------------------------------------------------------------
const raw = process.env[KEY_NAME];
if (!raw || !raw.trim()) {
  console.error(
    `✗ Environment variable ${KEY_NAME} is empty or missing.\n` +
      `  Usage: GEMINI_API_KEY="<your-key>" node scripts/phase17-set-gemini-key.js`,
  );
  process.exit(1);
}
const newKey = raw.trim();

// Loose sanity check — Google API keys start with "AIza" and are ≥ 35 chars.
// We don't hard-fail if the prefix is different (users may hand-craft keys
// for testing or rotate to a different provider-format in future), but we
// do refuse obviously-broken inputs like whitespace or a single word.
if (newKey.length < 10) {
  console.error(
    `✗ ${KEY_NAME} value looks too short (${newKey.length} chars). Aborting ` +
      `to avoid writing a garbage key. If this is intentional, set the env ` +
      `var to something at least 10 chars long.`,
  );
  process.exit(1);
}
if (/\s/.test(newKey)) {
  console.error(`✗ ${KEY_NAME} contains whitespace — trim the value and retry.`);
  process.exit(1);
}

// -----------------------------------------------------------------
// 2. Helpers — masking + fingerprint (never logs the key itself)
// -----------------------------------------------------------------
function fingerprint(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
}
function maskMeta(s) {
  return `length=${s.length} fp=${fingerprint(s)}`;
}

// -----------------------------------------------------------------
// 3. Read existing .env (or seed a new one)
// -----------------------------------------------------------------
let existing = '';
try {
  existing = fs.readFileSync(ENV_PATH, 'utf8');
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.error(`✗ Could not read ${ENV_PATH}: ${err.message}`);
    process.exit(2);
  }
  existing = '# apps/backend/.env — overrides the repo root .env\n';
}

// -----------------------------------------------------------------
// 4. Upsert
// -----------------------------------------------------------------
const lines = existing.split(/\r?\n/);
let action = 'added';
let oldFp = null;
let foundIndex = -1;

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && m[1] === KEY_NAME) {
    foundIndex = i;
    oldFp = m[2] ? fingerprint(m[2]) : null;
    break;
  }
}

if (foundIndex >= 0) {
  // Existing line — replace
  if (oldFp === fingerprint(newKey)) {
    action = 'unchanged';
  } else {
    lines[foundIndex] = `${KEY_NAME}=${newKey}`;
    action = 'updated';
  }
} else {
  // No existing line — append under (or add) "# AI providers" section
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const hasSection = lines.some((l) => l.trim() === AI_SECTION_HEADER);
  if (!hasSection) {
    lines.push('', AI_SECTION_HEADER);
  }
  lines.push(`${KEY_NAME}=${newKey}`);
}

// -----------------------------------------------------------------
// 5. Write back (atomically via tmp → rename to avoid half-written files)
// -----------------------------------------------------------------
try {
  fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  const tmpPath = ENV_PATH + '.tmp';
  fs.writeFileSync(tmpPath, lines.join('\n').replace(/\n*$/, '\n'), {
    encoding: 'utf8',
    mode: 0o600, // owner-read-write only
  });
  fs.renameSync(tmpPath, ENV_PATH);
  // Best-effort: tighten perms on the final file too
  try {
    fs.chmodSync(ENV_PATH, 0o600);
  } catch {
    /* Windows NTFS — fs.chmod is a no-op, ignore */
  }
} catch (err) {
  console.error(`✗ Could not write ${ENV_PATH}: ${err.message}`);
  process.exit(2);
}

// -----------------------------------------------------------------
// 6. Report — never prints the key, only metadata
// -----------------------------------------------------------------
console.log(`✓ ${KEY_NAME} ${action}`);
console.log(`  file : ${ENV_PATH}`);
console.log(`  meta : ${maskMeta(newKey)}`);
if (oldFp && oldFp !== fingerprint(newKey)) {
  console.log(`  prev : fp=${oldFp} (replaced)`);
}
console.log(`  next : restart backend — ts-node-dev doesn't reload .env`);
