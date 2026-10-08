import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffEnv } from '../src/diff.js';
import { renderDocs, injectDocs, START_MARKER, END_MARKER } from '../src/docs.js';
import { missingFromExample, appendToExample } from '../src/sync.js';
import { parseEnv } from '../src/parse-env.js';
import { parseSchema } from '../src/schema.js';

test('diffEnv classifies keys', () => {
  const diff = diffEnv({ A: '1', B: '2', C: '3' }, new Map([['B', '2'], ['C', 'x'], ['D', '4']]));
  assert.deepEqual(diff, {
    added: ['D'],
    removed: ['A'],
    changed: [{ key: 'C', from: '3', to: 'x' }],
    same: ['B'],
  });
});

test('renderDocs produces a Markdown table', () => {
  const schema = parseSchema('# Listening port\n# @type port\nPORT=3000\n# @optional @secret @type url\nDSN=\n# @enum a,b\nM=a\n# a | pipe\n# @min 2 @max 4\nS=');
  const md = renderDocs(schema);
  const lines = md.trim().split('\n');
  assert.equal(lines[0], '| Variable | Required | Type | Example | Description |');
  assert.equal(lines[2], '| `PORT` | yes | port | `3000` | Listening port |');
  assert.equal(lines[3], '| `DSN` | no | url | _(secret)_ |  |');
  assert.equal(lines[4], '| `M` | yes | enum: `a`, `b` | `a` |  |');
  assert.equal(lines[5], '| `S` | yes | string, 2–4 chars |  | a \\| pipe |');
});

test('renderDocs handles an empty schema', () => {
  assert.match(renderDocs(parseSchema('')), /No environment variables/);
});

test('injectDocs replaces the block between the markers and keeps the rest', () => {
  const doc = `# Readme\n\n${START_MARKER}\nold\n${END_MARKER}\n\nTail\n`;
  const result = injectDocs(doc, '| new |\n');
  assert.equal(result, `# Readme\n\n${START_MARKER}\n| new |\n${END_MARKER}\n\nTail\n`);
  assert.equal(injectDocs(result, '| new |\n'), result, 'idempotent');
});

test('injectDocs returns null without markers', () => {
  assert.equal(injectDocs('nothing here', 'x'), null);
  assert.equal(injectDocs(`${END_MARKER}\n${START_MARKER}`, 'x'), null, 'markers in the wrong order');
});

test('missingFromExample lists undeclared keys once, in file order', () => {
  const env = parseEnv('B=1\nA=2\nB=3\nC=4');
  const example = parseEnv('C=');
  assert.deepEqual(missingFromExample(env, example), ['B', 'A']);
});

test('appendToExample appends empty declarations after a blank line', () => {
  assert.equal(appendToExample('A=1', ['B', 'C']), 'A=1\n\nB=\nC=\n');
  assert.equal(appendToExample('A=1\n', ['B']), 'A=1\n\nB=\n');
  assert.equal(appendToExample('A=1\n\n', ['B']), 'A=1\n\nB=\n');
  assert.equal(appendToExample('', ['B']), 'B=\n');
  assert.equal(appendToExample('A=1\n', []), 'A=1\n');
});
