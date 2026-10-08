import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../src/parse-env.js';
import { parseSchema } from '../src/schema.js';
import { check, envFromParsed, envFromProcess } from '../src/check.js';

const EXAMPLE = `# @type port
PORT=3000
# @type url @secret
DATABASE_URL=
# @optional @type bool
DEBUG=
# @enum a,b
MODE=a
`;

const run = (envText, options = {}) =>
  check({ schema: parseSchema(EXAMPLE), env: envFromParsed(parseEnv(envText)), ...options });

const codes = (report) => report.problems.map((p) => `${p.level}:${p.code}:${p.key ?? '-'}`);

test('a matching env file produces an ok report', () => {
  const report = run('PORT=8080\nDATABASE_URL=postgres://x\nMODE=b\n');
  assert.equal(report.ok, true);
  assert.deepEqual(report.problems, []);
  assert.deepEqual(report.summary, { errors: 0, warnings: 0, variables: 4 });
});

test('missing and empty required variables are errors', () => {
  const report = run('PORT=8080\nDATABASE_URL=\n');
  assert.deepEqual(codes(report), ['error:empty:DATABASE_URL', 'error:missing:MODE']);
  assert.equal(report.problems[0].line, 2);
  assert.equal(report.problems[0].file, 'env');
  assert.equal(report.problems[1].line, null);
});

test('optional variables may be missing or empty but are validated when set', () => {
  assert.equal(run('PORT=1\nDATABASE_URL=x://y\nMODE=a\nDEBUG=').ok, true);
  const report = run('PORT=1\nDATABASE_URL=x://y\nMODE=a\nDEBUG=sometimes');
  assert.deepEqual(codes(report), ['error:invalid:DEBUG']);
});

test('invalid values report the validator message and the line', () => {
  const report = run('PORT=99999\nDATABASE_URL=x://y\nMODE=a');
  assert.deepEqual(codes(report), ['error:invalid:PORT']);
  assert.match(report.problems[0].message, /expected a port number/);
  assert.equal(report.problems[0].line, 1);
});

test('undeclared variables are warnings by default, errors or ignored on request', () => {
  const env = 'PORT=1\nDATABASE_URL=x://y\nMODE=a\nEXTRA=1';
  assert.deepEqual(codes(run(env)), ['warning:unknown:EXTRA']);
  assert.equal(run(env).ok, true);
  assert.deepEqual(codes(run(env, { unknownKeys: 'error' })), ['error:unknown:EXTRA']);
  assert.deepEqual(codes(run(env, { unknownKeys: 'ignore' })), []);
});

test('strict mode promotes warnings to errors', () => {
  const report = run('PORT=1\nDATABASE_URL=x://y\nMODE=a\nEXTRA=1', { strict: true });
  assert.equal(report.ok, false);
  assert.deepEqual(report.summary, { errors: 1, warnings: 0, variables: 4 });
});

test('duplicate keys in the env file are warnings', () => {
  const report = run('PORT=1\nDATABASE_URL=x://y\nMODE=a\nPORT=2');
  assert.deepEqual(codes(report), ['warning:duplicate:PORT']);
  assert.match(report.problems[0].message, /first on line 1/);
});

test('syntax errors in the env file are errors', () => {
  const report = run('PORT=1\nDATABASE_URL=x://y\nMODE=a\nnonsense');
  assert.deepEqual(codes(report), ['error:syntax:-']);
  assert.equal(report.problems[0].line, 4);
});

test('an unterminated quote does not make later variables look missing', () => {
  const report = run('PORT="8080\nDATABASE_URL=x://y\nMODE=a\n');
  assert.deepEqual(codes(report), ['error:syntax:-', 'error:missing:PORT']);
});

test('schema problems surface in the report, pointing at the example file', () => {
  const schema = parseSchema('# @type nope\nX=\n# @owner me\nY=');
  const report = check({ schema, env: envFromParsed(parseEnv('X=1\nY=2')) });
  assert.deepEqual(codes(report), ['error:schema:-', 'warning:schema:-']);
  assert.equal(report.problems[0].file, 'example');
  assert.equal(report.problems[0].line, 2);
});

test('process environments can be checked too', () => {
  const schema = parseSchema(EXAMPLE);
  const env = envFromProcess({ PORT: '80', DATABASE_URL: 'x://y', MODE: 'a', PATH: '/bin', HOME: undefined });
  const report = check({ schema, env, unknownKeys: 'ignore' });
  assert.equal(report.ok, true);
  assert.equal(env.values.has('HOME'), false);
});
