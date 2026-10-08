/**
 * Compares a set of environment values against a schema and produces a report.
 * This module is pure: it never touches the file system or the terminal.
 */

import { validateValue } from './validate.js';

/**
 * @typedef {object} EnvSource
 * @property {Map<string, {value: string, line: number|null}>} values
 * @property {{line: number, message: string}[]} [errors]       Syntax errors in the env file.
 * @property {{key: string, line: number, firstLine: number}[]} [duplicates]
 */

/**
 * @typedef {object} Problem
 * @property {'error'|'warning'} level
 * @property {'schema'|'syntax'|'duplicate'|'missing'|'empty'|'invalid'|'unknown'|'git'} code
 * @property {string|null} key
 * @property {string} message
 * @property {number|null} line
 * @property {'env'|'example'|null} file   Which file the line number refers to.
 */

/**
 * @typedef {object} Report
 * @property {boolean} ok
 * @property {Problem[]} problems
 * @property {{errors: number, warnings: number, variables: number}} summary
 */

/**
 * Turn a parsed env file into an EnvSource (last duplicate wins).
 * @param {import('./parse-env.js').ParsedEnv} parsed
 * @returns {EnvSource}
 */
export function envFromParsed(parsed) {
  const values = new Map();
  for (const entry of parsed.entries) values.set(entry.key, { value: entry.value, line: entry.line });
  return { values, errors: parsed.errors, duplicates: parsed.duplicates };
}

/**
 * Turn a process environment object into an EnvSource.
 * @param {Record<string, string|undefined>} processEnv
 * @returns {EnvSource}
 */
export function envFromProcess(processEnv) {
  const values = new Map();
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined) values.set(key, { value, line: null });
  }
  return { values, errors: [], duplicates: [] };
}

/**
 * @param {object} input
 * @param {import('./schema.js').Schema} input.schema
 * @param {EnvSource} input.env
 * @param {'warn'|'error'|'ignore'} [input.unknownKeys='warn']  How to report keys not in the schema.
 * @param {boolean} [input.strict=false]                       Promote every warning to an error.
 * @returns {Report}
 */
export function check({ schema, env, unknownKeys = 'warn', strict = false }) {
  /** @type {Problem[]} */
  const problems = [];
  const push = (problem) =>
    problems.push({ level: problem.level, code: problem.code, key: null, message: problem.message, line: null, file: null, ...problem });

  for (const e of schema.errors) push({ level: 'error', code: 'schema', message: e.message, line: e.line, file: 'example' });
  for (const w of schema.warnings) push({ level: 'warning', code: 'schema', message: w.message, line: w.line, file: 'example' });

  for (const e of env.errors ?? []) push({ level: 'error', code: 'syntax', message: e.message, line: e.line, file: 'env' });
  for (const d of env.duplicates ?? []) {
    push({
      level: 'warning',
      code: 'duplicate',
      key: d.key,
      message: `defined more than once (first on line ${d.firstLine}); the last value wins`,
      line: d.line,
      file: 'env',
    });
  }

  for (const rule of schema.rules) {
    const entry = env.values.get(rule.key);
    if (!entry) {
      if (rule.required) push({ level: 'error', code: 'missing', key: rule.key, message: 'is missing (required)' });
      continue;
    }
    if (entry.value === '') {
      if (rule.required) {
        push({ level: 'error', code: 'empty', key: rule.key, message: 'is empty (required)', line: entry.line, file: 'env' });
      }
      continue;
    }
    const message = validateValue(entry.value, rule);
    if (message) push({ level: 'error', code: 'invalid', key: rule.key, message, line: entry.line, file: 'env' });
  }

  if (unknownKeys !== 'ignore') {
    const known = new Set(schema.rules.map((r) => r.key));
    for (const [key, entry] of env.values) {
      if (known.has(key)) continue;
      push({
        level: unknownKeys === 'error' ? 'error' : 'warning',
        code: 'unknown',
        key,
        message: 'is not declared in the example file',
        line: entry.line,
        file: 'env',
      });
    }
  }

  return finalizeReport(problems, schema.rules.length, strict);
}

/**
 * Build the report object from a list of problems. Exported so the CLI can
 * append file-system level problems (like git checks) and re-summarise.
 * @param {Problem[]} problems
 * @param {number} variables
 * @param {boolean} strict
 * @returns {Report}
 */
export function finalizeReport(problems, variables, strict) {
  const final = strict ? problems.map((p) => (p.level === 'warning' ? { ...p, level: 'error' } : p)) : problems;
  const errors = final.filter((p) => p.level === 'error').length;
  const warnings = final.length - errors;
  return { ok: errors === 0, problems: final, summary: { errors, warnings, variables } };
}
