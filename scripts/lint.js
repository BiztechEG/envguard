#!/usr/bin/env node
/**
 * Dependency-free lint: every JavaScript file must parse, end with a newline,
 * use spaces for indentation and carry no trailing whitespace.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOTS = ['bin', 'src', 'test', 'scripts'];
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file);
    else if (extname(file) === '.js') lint(file);
  }
}

function lint(file) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) problems.push(`${file}: ${syntax.stderr.trim()}`);

  const text = readFileSync(file, 'utf8');
  if (!text.endsWith('\n')) problems.push(`${file}: missing newline at end of file`);
  text.split('\n').forEach((line, i) => {
    if (/[ \t]+$/.test(line)) problems.push(`${file}:${i + 1}: trailing whitespace`);
    if (/^\t/.test(line)) problems.push(`${file}:${i + 1}: tab indentation`);
  });
}

for (const root of ROOTS) {
  try {
    walk(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('lint: ok');
