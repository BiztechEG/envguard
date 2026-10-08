import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchema } from '../src/schema.js';

const rule = (source, key) => parseSchema(source).rules.find((r) => r.key === key);

test('every variable becomes a required string rule by default', () => {
  const schema = parseSchema('FOO=bar\nBAZ=');
  assert.deepEqual(schema.errors, []);
  assert.equal(schema.rules.length, 2);
  assert.equal(schema.rules[0].type, 'string');
  assert.equal(schema.rules[0].required, true);
  assert.equal(schema.rules[0].example, 'bar');
});

test('plain comment lines directly above become the description', () => {
  const r = rule('# Database connection string\n# used by the API\nDATABASE_URL=', 'DATABASE_URL');
  assert.equal(r.description, 'Database connection string used by the API');
});

test('a blank line detaches a comment block', () => {
  const r = rule('# Section header\n\nFOO=', 'FOO');
  assert.equal(r.description, '');
});

test('parses several annotations on one line', () => {
  const r = rule('# @type int @min 1 @max 65535\nPORT=', 'PORT');
  assert.equal(r.type, 'int');
  assert.equal(r.min, 1);
  assert.equal(r.max, 65535);
});

test('mixes description text and annotations', () => {
  const r = rule('# Port to listen on @type port @optional\nPORT=', 'PORT');
  assert.equal(r.description, 'Port to listen on');
  assert.equal(r.type, 'port');
  assert.equal(r.required, false);
});

test('@enum implies the enum type', () => {
  const r = rule('# @enum development, production,test\nNODE_ENV=', 'NODE_ENV');
  assert.equal(r.type, 'enum');
  assert.deepEqual(r.enum, ['development', 'production', 'test']);
});

test('@type enum accepts inline values', () => {
  const r = rule('# @type enum a,b\nX=', 'X');
  assert.deepEqual(r.enum, ['a', 'b']);
});

test('@type enum without values is a schema error', () => {
  const schema = parseSchema('# @type enum\nX=');
  assert.equal(schema.errors.length, 1);
  assert.match(schema.errors[0].message, /needs the allowed values/);
});

test('type aliases are normalised', () => {
  assert.equal(rule('# @type boolean\nX=', 'X').type, 'bool');
  assert.equal(rule('# @type integer\nX=', 'X').type, 'int');
  assert.equal(rule('# @type number\nX=', 'X').type, 'float');
  assert.equal(rule('# @type URI\nX=', 'X').type, 'url');
});

test('unknown types are schema errors', () => {
  const schema = parseSchema('# @type banana\nX=');
  assert.match(schema.errors[0].message, /unknown @type "banana"/);
  assert.equal(schema.errors[0].line, 2);
});

test('@pattern swallows the rest of the line and accepts slashes', () => {
  assert.equal(rule('# @pattern ^[a-z]+@[a-z]+$\nX=', 'X').pattern, '^[a-z]+@[a-z]+$');
  assert.equal(rule('# @pattern /^\\d+$/\nX=', 'X').pattern, '^\\d+$');
});

test('an invalid @pattern is a schema error', () => {
  const schema = parseSchema('# @pattern [unclosed\nX=');
  assert.match(schema.errors[0].message, /invalid @pattern/);
});

test('@min greater than @max is a schema error', () => {
  const schema = parseSchema('# @min 10 @max 1\nX=');
  assert.match(schema.errors[0].message, /@min \(10\) is greater than @max \(1\)/);
});

test('@min and @max must be numbers', () => {
  const schema = parseSchema('# @min ten\nX=');
  assert.match(schema.errors[0].message, /@min needs a number/);
});

test('@secret and @optional flags', () => {
  const r = rule('# @optional @secret\nTOKEN=', 'TOKEN');
  assert.equal(r.required, false);
  assert.equal(r.secret, true);
});

test('@desc provides a description', () => {
  assert.equal(rule('# @type int @desc Number of workers\nX=', 'X').description, 'Number of workers');
});

test('an @ glued to a word (like an email) is not an annotation', () => {
  const schema = parseSchema('# Contact ops@example.com for access\nX=');
  assert.deepEqual(schema.errors, []);
  assert.deepEqual(schema.warnings, []);
  assert.equal(schema.rules[0].description, 'Contact ops@example.com for access');
});

test('unknown annotations are warnings, not errors', () => {
  const schema = parseSchema('# @owner platform-team\nX=');
  assert.deepEqual(schema.errors, []);
  assert.equal(schema.warnings.length, 1);
  assert.match(schema.warnings[0].message, /unknown annotation @owner/);
});

test('duplicate declarations are schema errors', () => {
  const schema = parseSchema('X=1\nX=2');
  assert.match(schema.errors[0].message, /X is declared twice/);
});

test('syntax errors in the example file are schema errors', () => {
  const schema = parseSchema('NOT A VARIABLE');
  assert.equal(schema.errors.length, 1);
  assert.equal(schema.rules.length, 0);
});
