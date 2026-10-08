/**
 * envguard — public programmatic API.
 *
 *   import { parseSchema, parseEnv, envFromParsed, check } from 'envguard';
 *
 *   const schema = parseSchema(fs.readFileSync('.env.example', 'utf8'));
 *   const env = envFromParsed(parseEnv(fs.readFileSync('.env', 'utf8')));
 *   const report = check({ schema, env });
 *   if (!report.ok) console.error(report.problems);
 */

export { parseEnv, toMap, toObject } from './parse-env.js';
export { parseSchema, TYPES } from './schema.js';
export { validateValue } from './validate.js';
export { check, envFromParsed, envFromProcess, finalizeReport } from './check.js';
export { diffEnv } from './diff.js';
export { renderDocs, injectDocs, START_MARKER, END_MARKER } from './docs.js';
export { missingFromExample, appendToExample } from './sync.js';
export { run } from './cli.js';
