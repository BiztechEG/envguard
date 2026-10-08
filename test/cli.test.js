import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from '../src/cli.js';
import { START_MARKER, END_MARKER } from '../src/docs.js';

const BIN = fileURLToPath(new URL('../bin/envguard.js', import.meta.url));
const EXAMPLE = `# @type port
PORT=3000
# @type url @secret
DATABASE_URL=
# @optional
DEBUG=
`;

let root;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-'));
});
after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

let counter = 0;
function project(files) {
  const dir = path.join(root, `p${counter++}`);
  fs.mkdirSync(dir);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

async function cli(cwd, ...args) {
  let stdout = '';
  let stderr = '';
  const code = await run(args, {
    cwd,
    stdout: { write: (t) => (stdout += t), isTTY: false },
    stderr: { write: (t) => (stderr += t), isTTY: false },
    env: { NO_COLOR: '1' },
  });
  return { code, stdout, stderr };
}

test('check passes on a valid env file', async () => {
  const dir = project({ '.env.example': EXAMPLE, '.env': 'PORT=80\nDATABASE_URL=postgres://x\n' });
  const { code, stdout } = await cli(dir, 'check', '--no-git');
  assert.equal(code, 0);
  assert.match(stdout, /✔ \.env matches \.env\.example \(3 variables\)/);
});

test('check is the default command and reports problems with exit code 1', async () => {
  const dir = project({ '.env.example': EXAMPLE, '.env': 'PORT=abc\nEXTRA=1\n' });
  const { code, stdout } = await cli(dir, '--no-git');
  assert.equal(code, 1);
  assert.match(stdout, /✖ {2}PORT .*expected a port number/);
  assert.match(stdout, /✖ {2}DATABASE_URL .*is missing \(required\)/);
  assert.match(stdout, /⚠ {2}EXTRA .*not declared/);
  assert.match(stdout, /✖ 2 errors, 1 warning \(3 variables\)/);
});

test('--quiet prints nothing on success', async () => {
  const dir = project({ '.env.example': EXAMPLE, '.env': 'PORT=80\nDATABASE_URL=postgres://x\n' });
  const { code, stdout } = await cli(dir, 'check', '--no-git', '--quiet');
  assert.equal(code, 0);
  assert.equal(stdout, '');
});

test('--strict fails on warnings', async () => {
  const dir = project({ '.env.example': EXAMPLE, '.env': 'PORT=80\nDATABASE_URL=postgres://x\nEXTRA=1\n' });
  assert.equal((await cli(dir, '--no-git')).code, 0);
  assert.equal((await cli(dir, '--no-git', '--strict')).code, 1);
  assert.equal((await cli(dir, '--no-git', '--strict', '--allow-unknown')).code, 0);
});

test('--json prints a machine-readable report', async () => {
  const dir = project({ '.env.example': EXAMPLE, '.env': 'PORT=abc\n' });
  const { code, stdout } = await cli(dir, '--no-git', '--json');
  assert.equal(code, 1);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, false);
  assert.equal(report.env, '.env');
  assert.deepEqual(report.problems.map((p) => p.code), ['invalid', 'missing']);
  assert.deepEqual(report.summary, { errors: 2, warnings: 0, variables: 3 });
});

test('--env and --example choose the files', async () => {
  const dir = project({ 'schema.env': 'A=\n', 'prod.env': 'A=1\n' });
  const { code } = await cli(dir, 'check', '-e', 'prod.env', '-x', 'schema.env', '--no-git');
  assert.equal(code, 0);
});

test('a missing env file is a usage error with a hint', async () => {
  const dir = project({ '.env.example': EXAMPLE });
  const { code, stderr } = await cli(dir, 'check');
  assert.equal(code, 2);
  assert.match(stderr, /\.env not found.*envguard init/);
});

test('a missing example file is a usage error', async () => {
  const dir = project({ '.env': 'A=1\n' });
  const { code, stderr } = await cli(dir, 'check');
  assert.equal(code, 2);
  assert.match(stderr, /\.env\.example not found/);
});

test('--process-env validates the given environment and ignores unrelated keys', async () => {
  const dir = project({ '.env.example': EXAMPLE });
  const good = await run(['check', '--process-env'], {
    cwd: dir,
    stdout: { write() {} },
    stderr: { write() {} },
    env: { PORT: '80', DATABASE_URL: 'postgres://x', PATH: '/usr/bin', NO_COLOR: '1' },
  });
  assert.equal(good, 0);
  const bad = await run(['check', '-p'], {
    cwd: dir,
    stdout: { write() {} },
    stderr: { write() {} },
    env: { PORT: 'nope', NO_COLOR: '1' },
  });
  assert.equal(bad, 1);
});

test('unknown flags and commands are usage errors', async () => {
  const dir = project({});
  assert.equal((await cli(dir, '--bogus')).code, 2);
  const { code, stderr } = await cli(dir, 'explode');
  assert.equal(code, 2);
  assert.match(stderr, /unknown command "explode"/);
});

test('--help and --version', async () => {
  const dir = project({});
  assert.match((await cli(dir, '--help')).stdout, /Usage/);
  assert.match((await cli(dir, 'help')).stdout, /Annotations/);
  assert.match((await cli(dir, '--version')).stdout, /^\d+\.\d+\.\d+/);
});

test('init copies the example and refuses to overwrite without --force', async () => {
  const dir = project({ '.env.example': EXAMPLE });
  assert.equal((await cli(dir, 'init')).code, 0);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), EXAMPLE);
  const second = await cli(dir, 'init');
  assert.equal(second.code, 2);
  assert.match(second.stderr, /already exists/);
  fs.writeFileSync(path.join(dir, '.env'), 'changed');
  assert.equal((await cli(dir, 'init', '--force')).code, 0);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), EXAMPLE);
});

test('sync reports undeclared variables and appends them with --write', async () => {
  const dir = project({ '.env.example': 'A=\n', '.env': 'A=1\nB=2\nC=3\n' });
  const dry = await cli(dir, 'sync');
  assert.equal(dry.code, 1);
  assert.match(dry.stdout, /2 variables are set in \.env but not declared/);
  assert.equal(fs.readFileSync(path.join(dir, '.env.example'), 'utf8'), 'A=\n');

  const write = await cli(dir, 'sync', '--write');
  assert.equal(write.code, 0);
  assert.equal(fs.readFileSync(path.join(dir, '.env.example'), 'utf8'), 'A=\n\nB=\nC=\n');
  assert.equal((await cli(dir, 'sync')).code, 0);
});

test('sync creates the example file when it does not exist yet', async () => {
  const dir = project({ '.env': 'A=1\n' });
  assert.equal((await cli(dir, 'sync', '--write')).code, 0);
  assert.equal(fs.readFileSync(path.join(dir, '.env.example'), 'utf8'), 'A=\n');
});

test('diff compares two files and hides values unless asked', async () => {
  const dir = project({ 'a.env': 'A=1\nB=2\nC=3\n', 'b.env': 'B=2\nC=x\nD=4\n' });
  const hidden = await cli(dir, 'diff', 'a.env', 'b.env');
  assert.equal(hidden.code, 1);
  assert.match(hidden.stdout, /- A\n/);
  assert.match(hidden.stdout, /\+ D\n/);
  assert.match(hidden.stdout, /~ C\n/);
  assert.doesNotMatch(hidden.stdout, /"x"/);
  assert.match(hidden.stdout, /1 added, 1 removed, 1 changed, 1 unchanged/);

  const shown = await cli(dir, 'diff', 'a.env', 'b.env', '--values');
  assert.match(shown.stdout, /~ C {2}"3" → "x"/);

  const json = JSON.parse((await cli(dir, 'diff', 'a.env', 'b.env', '--json')).stdout);
  assert.deepEqual(json.changed, ['C']);
  assert.equal((await cli(dir, 'diff', 'a.env', 'a.env')).code, 0);
  assert.equal((await cli(dir, 'diff', 'a.env')).code, 2);
});

test('docs prints a table and injects it into a file', async () => {
  const readme = `# App\n\n${START_MARKER}\n${END_MARKER}\n`;
  const dir = project({ '.env.example': EXAMPLE, 'README.md': readme });
  const table = await cli(dir, 'docs');
  assert.equal(table.code, 0);
  assert.match(table.stdout, /\| `PORT` \| yes \| port \| `3000` \|/);

  const stale = await cli(dir, 'docs', '--inject', 'README.md', '--check');
  assert.equal(stale.code, 1);
  assert.match(stale.stdout, /out of date/);

  assert.equal((await cli(dir, 'docs', '--inject', 'README.md')).code, 0);
  const updated = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.match(updated, /\| `DATABASE_URL` \| yes \| url \| _\(secret\)_ \|/);
  assert.equal((await cli(dir, 'docs', '--inject', 'README.md', '--check')).code, 0);

  const noMarkers = await cli(project({ '.env.example': EXAMPLE, 'X.md': 'hi' }), 'docs', '--inject', 'X.md');
  assert.equal(noMarkers.code, 2);
  assert.match(noMarkers.stderr, /no <!-- envguard:start -->/);
});

test('docs refuses to render a broken example file', async () => {
  const dir = project({ '.env.example': '# @type nope\nX=\n' });
  const { code, stderr } = await cli(dir, 'docs');
  assert.equal(code, 1);
  assert.match(stderr, /unknown @type/);
});

const hasGit = spawnSync('git', ['--version']).status === 0;

test('check warns when the env file is not ignored or is tracked by git', { skip: !hasGit }, async () => {
  const dir = project({ '.env.example': EXAMPLE, '.env': 'PORT=80\nDATABASE_URL=postgres://x\n' });
  spawnSync('git', ['init', '-q'], { cwd: dir });

  const unignored = await cli(dir, 'check');
  assert.equal(unignored.code, 0, 'git hygiene is a warning by default');
  assert.match(unignored.stdout, /⚠ .*\.env is not ignored by git/);
  assert.equal((await cli(dir, 'check', '--strict')).code, 1);
  assert.doesNotMatch((await cli(dir, 'check', '--no-git')).stdout, /git/);

  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
  const ignored = await cli(dir, 'check');
  assert.doesNotMatch(ignored.stdout, /git/);

  spawnSync('git', ['add', '-f', '.env'], { cwd: dir });
  const tracked = await cli(dir, 'check');
  assert.match(tracked.stdout, /⚠ .*\.env is tracked by git.*git rm --cached \.env/);
});

test('the bin entry runs end to end', () => {
  const dir = project({ '.env.example': EXAMPLE, '.env': 'PORT=80\nDATABASE_URL=postgres://x\n' });
  const result = spawnSync(process.execPath, [BIN, 'check', '--no-git'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /✔/);
});
