import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, toMap, toObject } from '../src/parse-env.js';

const values = (source) => toObject(parseEnv(source).entries);

test('parses plain KEY=value pairs, blank lines and comments', () => {
  const parsed = parseEnv('# comment\n\nFOO=bar\nBAZ = qux \n');
  assert.deepEqual(toObject(parsed.entries), { FOO: 'bar', BAZ: 'qux' });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries[0].line, 3);
  assert.equal(parsed.entries[1].line, 4);
});

test('supports the export prefix', () => {
  const parsed = parseEnv('export FOO=bar');
  assert.equal(parsed.entries[0].value, 'bar');
  assert.equal(parsed.entries[0].exported, true);
});

test('empty values are allowed', () => {
  assert.deepEqual(values('EMPTY=\nQUOTED=""\nSINGLE=\'\''), { EMPTY: '', QUOTED: '', SINGLE: '' });
});

test('inline comments need whitespace before the hash', () => {
  assert.deepEqual(values('A=value # comment\nB=value#notacomment\nC=#empty'), {
    A: 'value',
    B: 'value#notacomment',
    C: '',
  });
});

test('double quotes keep spaces, hashes and support escapes', () => {
  assert.deepEqual(values('A="hello # world"\nB="line1\\nline2"\nC="say \\"hi\\""\nD="back\\\\slash"'), {
    A: 'hello # world',
    B: 'line1\nline2',
    C: 'say "hi"',
    D: 'back\\slash',
  });
});

test('single quotes are literal', () => {
  assert.deepEqual(values("A='no \\n escape'\nB='# not a comment'"), {
    A: 'no \\n escape',
    B: '# not a comment',
  });
});

test('quoted values may span several lines', () => {
  const parsed = parseEnv('KEY="-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----"\nNEXT=1');
  assert.equal(parsed.entries[0].value, '-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----');
  assert.equal(parsed.entries[0].line, 1);
  assert.equal(parsed.entries[0].endLine, 4);
  assert.equal(parsed.entries[1].key, 'NEXT');
  assert.equal(parsed.entries[1].line, 5);
});

test('trailing spaces inside a multi-line quoted value are kept', () => {
  assert.equal(parseEnv('A="foo   \nbar"').entries[0].value, 'foo   \nbar');
  assert.equal(parseEnv("A='x  \n  y'").entries[0].value, 'x  \n  y');
});

test('whitespace around unquoted and single-line quoted values is trimmed', () => {
  assert.deepEqual(values('A=  spaced  \nB="q"   \nC=\'s\'  # note\n  export D = 1  '), { A: 'spaced', B: 'q', C: 's', D: '1' });
});

test('a comment may follow a closing quote', () => {
  assert.deepEqual(values('A="x" # note'), { A: 'x' });
});

test('reports lines without an equals sign', () => {
  const parsed = parseEnv('FOO=1\nJUSTAWORD\nBAR=2');
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].line, 2);
  assert.match(parsed.errors[0].message, /expected KEY=value/);
  assert.doesNotMatch(parsed.errors[0].message, /JUSTAWORD/);
  assert.deepEqual(toObject(parsed.entries), { FOO: '1', BAR: '2' });
});

test('reports invalid variable names', () => {
  const parsed = parseEnv('1BAD=x\nAL-SO=y\n=z\nFINE_1=ok');
  assert.deepEqual(
    parsed.errors.map((e) => e.line),
    [1, 2, 3],
  );
  assert.match(parsed.errors[2].message, /missing variable name/);
  assert.deepEqual(toObject(parsed.entries), { FINE_1: 'ok' });
});

test('reports unterminated quotes and keeps parsing the following lines', () => {
  const parsed = parseEnv('A="never closed\nB=2\nC=\'also open\nD=4');
  assert.deepEqual(
    parsed.errors.map((e) => [e.line, e.message]),
    [
      [1, 'unterminated double-quoted value for A'],
      [3, 'unterminated single-quoted value for C'],
    ],
  );
  assert.deepEqual(toObject(parsed.entries), { B: '2', D: '4' });
});

test('reports text after a closing quote', () => {
  const parsed = parseEnv('A="x" trailing');
  assert.match(parsed.errors[0].message, /unexpected text after the closing quote of A/);
  assert.doesNotMatch(parsed.errors[0].message, /trailing/);
});

test('syntax errors never quote the offending text', () => {
  const secret = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7';
  const source = [
    'PRIVATE_KEY=-----BEGIN PRIVATE KEY-----',
    secret,
    `${secret}+/x=1`,
    `TOKEN="abc"${secret}`,
  ].join('\n');
  const parsed = parseEnv(source);
  assert.equal(parsed.errors.length, 3);
  for (const error of parsed.errors) {
    assert.ok(!error.message.includes(secret.slice(0, 12)), error.message);
  }
});

test('tracks duplicate keys and lets the last one win', () => {
  const parsed = parseEnv('A=1\nB=2\nA=3');
  assert.deepEqual(parsed.duplicates, [{ key: 'A', line: 3, firstLine: 1 }]);
  assert.equal(toMap(parsed.entries).get('A').value, '3');
});

test('handles CRLF line endings', () => {
  assert.deepEqual(values('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});
