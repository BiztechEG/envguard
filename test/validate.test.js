import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateValue } from '../src/validate.js';

const base = { key: 'X', line: 1, type: 'string', required: true, enum: null, pattern: null, min: null, max: null, secret: false, description: '', example: '' };
const rule = (extra) => ({ ...base, ...extra });
const ok = (value, extra) => assert.equal(validateValue(value, rule(extra)), null, `${JSON.stringify(value)} should be valid`);
const bad = (value, extra, re) => {
  const message = validateValue(value, rule(extra));
  assert.ok(message, `${JSON.stringify(value)} should be invalid`);
  if (re) assert.match(message, re);
};

test('string accepts anything', () => {
  ok('', {});
  ok('anything at all', {});
});

test('int', () => {
  ok('42', { type: 'int' });
  ok('-7', { type: 'int' });
  bad('4.2', { type: 'int' }, /expected an integer/);
  bad('abc', { type: 'int' });
});

test('float', () => {
  ok('3.14', { type: 'float' });
  ok('.5', { type: 'float' });
  ok('1e10', { type: 'float' });
  bad('1.2.3', { type: 'float' }, /expected a number/);
  bad('', { type: 'float' });
});

test('bool', () => {
  for (const v of ['true', 'FALSE', '1', '0', 'yes', 'no', 'on', 'Off']) ok(v, { type: 'bool' });
  bad('maybe', { type: 'bool' }, /expected a boolean/);
});

test('url', () => {
  ok('https://example.com/path?x=1', { type: 'url' });
  ok('postgres://user:pw@host:5432/db', { type: 'url' });
  ok('redis://localhost', { type: 'url' });
  bad('example.com', { type: 'url' }, /expected a URL/);
  bad('http://with space.com', { type: 'url' });
});

test('email', () => {
  ok('a@b.co', { type: 'email' });
  bad('not-an-email', { type: 'email' }, /expected an email/);
});

test('port', () => {
  ok('1', { type: 'port' });
  ok('65535', { type: 'port' });
  bad('0', { type: 'port' }, /expected a port number/);
  bad('65536', { type: 'port' });
  bad('80a', { type: 'port' });
});

test('json', () => {
  ok('{"a":1}', { type: 'json' });
  ok('[1,2]', { type: 'json' });
  ok('"str"', { type: 'json' });
  bad('{a:1}', { type: 'json' }, /expected valid JSON/);
});

test('uuid', () => {
  ok('123e4567-e89b-12d3-a456-426614174000', { type: 'uuid' });
  bad('123e4567', { type: 'uuid' }, /expected a UUID/);
});

test('enum', () => {
  ok('b', { type: 'enum', enum: ['a', 'b'] });
  bad('c', { type: 'enum', enum: ['a', 'b'] }, /expected one of a, b/);
});

test('pattern applies on top of the type', () => {
  ok('abc', { pattern: '^[a-z]+$' });
  bad('ABC', { pattern: '^[a-z]+$' }, /does not match pattern/);
  bad('https://example.com/', { type: 'url', pattern: '[^/]$' });
});

test('min and max bound numbers for numeric types', () => {
  ok('5', { type: 'int', min: 1, max: 10 });
  bad('0', { type: 'int', min: 1 }, /at least 1/);
  bad('11', { type: 'int', max: 10 }, /at most 10/);
  bad('70000', { type: 'port', max: 1024 }, /expected a port/);
  bad('2000', { type: 'port', max: 1024 }, /at most 1024/);
});

test('min and max bound the length of strings', () => {
  ok('abcd', { min: 4 });
  bad('abc', { min: 4 }, /at least 4 characters/);
  bad('abcde', { max: 4 }, /at most 4 characters/);
});

test('secret values are never echoed', () => {
  const message = validateValue('hunter2', rule({ type: 'int', secret: true }));
  assert.ok(!message.includes('hunter2'));
  assert.match(message, /\(hidden\)/);
});

test('long values are truncated in messages', () => {
  const message = validateValue('x'.repeat(100), rule({ type: 'int' }));
  assert.ok(message.length < 80);
  assert.match(message, /…/);
});
