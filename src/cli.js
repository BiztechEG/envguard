/**
 * Command-line interface. `run()` is exported so it can be tested without
 * spawning a process; `bin/envguard.js` is a thin wrapper around it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

import { parseEnv, toMap } from './parse-env.js';
import { parseSchema } from './schema.js';
import { check, envFromParsed, envFromProcess, finalizeReport } from './check.js';
import { diffEnv } from './diff.js';
import { renderDocs, injectDocs, START_MARKER, END_MARKER } from './docs.js';
import { missingFromExample, appendToExample } from './sync.js';
import { gitFileStatus } from './git.js';
import { makePalette, formatReport } from './format.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const COMMANDS = ['check', 'init', 'sync', 'diff', 'docs', 'help'];

const OPTIONS = {
  env: { type: 'string', short: 'e', default: '.env' },
  example: { type: 'string', short: 'x', default: '.env.example' },
  'process-env': { type: 'boolean', short: 'p', default: false },
  strict: { type: 'boolean', default: false },
  'allow-unknown': { type: 'boolean', default: false },
  'no-git': { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  quiet: { type: 'boolean', short: 'q', default: false },
  'no-color': { type: 'boolean', default: false },
  values: { type: 'boolean', default: false },
  write: { type: 'boolean', short: 'w', default: false },
  force: { type: 'boolean', short: 'f', default: false },
  check: { type: 'boolean', default: false },
  inject: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
};

class UsageError extends Error {}

/**
 * @param {string[]} argv  Arguments without the node binary and script path.
 * @param {object} io
 * @param {string} io.cwd
 * @param {{write(text: string): unknown, isTTY?: boolean}} io.stdout
 * @param {{write(text: string): unknown, isTTY?: boolean}} io.stderr
 * @param {Record<string, string|undefined>} io.env
 * @returns {Promise<number>} Exit code: 0 ok, 1 problems found, 2 usage error.
 */
export async function run(argv, io) {
  const out = (text) => io.stdout.write(text);
  const err = (text) => io.stderr.write(text);

  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    err(`envguard: ${error.message}\n\nRun "envguard --help" for usage.\n`);
    return 2;
  }

  const flags = parsed.values;
  const c = makePalette(io.stdout, io.env, Boolean(flags['no-color'] || flags.json));

  if (flags.version) {
    out(`${version}\n`);
    return 0;
  }

  const [command = 'check', ...rest] = parsed.positionals;
  if (flags.help || command === 'help') {
    out(usage());
    return 0;
  }
  if (!COMMANDS.includes(command)) {
    err(`envguard: unknown command "${command}"\n\n${usage()}`);
    return 2;
  }

  const ctx = { cwd: io.cwd, flags, c, out, err, rest, processEnv: io.env };
  try {
    switch (command) {
      case 'check':
        return runCheck(ctx);
      case 'init':
        return runInit(ctx);
      case 'sync':
        return runSync(ctx);
      case 'diff':
        return runDiff(ctx);
      case 'docs':
        return runDocs(ctx);
      default:
        return 2;
    }
  } catch (error) {
    if (error instanceof UsageError) {
      err(`envguard: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

function runCheck({ cwd, flags, c, out, processEnv }) {
  const examplePath = String(flags.example);
  const envPath = String(flags.env);
  const schema = parseSchema(readFile(cwd, examplePath, 'example'));

  let env;
  let envLabel;
  if (flags['process-env']) {
    env = envFromProcess(processEnv);
    envLabel = 'process.env';
  } else {
    const text = readFileOrNull(cwd, envPath);
    if (text === null) {
      throw new UsageError(`${envPath} not found. Create it from ${examplePath} with "envguard init".`);
    }
    env = envFromParsed(parseEnv(text));
    envLabel = envPath;
  }

  const unknownKeys = flags['allow-unknown'] || flags['process-env'] ? 'ignore' : 'warn';
  const base = check({ schema, env, unknownKeys });
  const problems = [...base.problems];

  if (!flags['process-env'] && !flags['no-git']) {
    const status = gitFileStatus(envPath, cwd);
    if (status.inRepo && status.tracked) {
      problems.push(gitProblem(`${envPath} is tracked by git; add it to .gitignore and run "git rm --cached ${envPath}" so secrets are never committed`));
    } else if (status.inRepo && !status.ignored) {
      problems.push(gitProblem(`${envPath} is not ignored by git; add it to .gitignore so it cannot be committed by accident`));
    }
  }

  const report = finalizeReport(problems, base.summary.variables, Boolean(flags.strict));

  if (flags.json) {
    out(`${JSON.stringify({ env: envLabel, example: examplePath, ...report }, null, 2)}\n`);
  } else if (!(flags.quiet && report.problems.length === 0)) {
    out(formatReport(report, { c, envLabel, exampleLabel: examplePath }));
  }
  return report.ok ? 0 : 1;
}

function gitProblem(message) {
  return { level: 'warning', code: 'git', key: null, message, line: null, file: null };
}

function runInit({ cwd, flags, c, out }) {
  const examplePath = String(flags.example);
  const envPath = String(flags.env);
  const source = readFile(cwd, examplePath, 'example');
  const target = path.resolve(cwd, envPath);
  if (fs.existsSync(target) && !flags.force) {
    throw new UsageError(`${envPath} already exists (use --force to overwrite it)`);
  }
  fs.writeFileSync(target, source);
  out(`${c.green('✔')} created ${c.bold(envPath)} from ${examplePath}. Fill in the values, then run ${c.cyan('envguard check')}.\n`);
  return 0;
}

function runSync({ cwd, flags, c, out }) {
  const examplePath = String(flags.example);
  const envPath = String(flags.env);
  const exampleText = readFileOrNull(cwd, examplePath) ?? '';
  const envText = readFile(cwd, envPath, 'env');
  const missing = missingFromExample(parseEnv(envText), parseEnv(exampleText));

  if (!missing.length) {
    if (!flags.quiet) out(`${c.green('✔')} ${c.bold(examplePath)} already declares every variable in ${envPath}\n`);
    return 0;
  }

  const list = missing.map((key) => `  ${c.green('+')} ${key}`).join('\n');
  if (flags.write) {
    fs.writeFileSync(path.resolve(cwd, examplePath), appendToExample(exampleText, missing));
    out(`${c.green('✔')} added ${missing.length} variable${missing.length === 1 ? '' : 's'} to ${c.bold(examplePath)}:\n${list}\n`);
    out(c.dim('Values were left empty. Add a comment with @type above each one to document it.\n'));
    return 0;
  }

  out(`${c.yellow('⚠')} ${missing.length} variable${missing.length === 1 ? ' is' : 's are'} set in ${envPath} but not declared in ${c.bold(examplePath)}:\n${list}\n`);
  out(`Run ${c.cyan('envguard sync --write')} to append them.\n`);
  return 1;
}

function runDiff({ cwd, flags, c, out, rest }) {
  const [aPath, bPath] = rest;
  if (!aPath || !bPath) throw new UsageError('diff needs two files: envguard diff <a> <b>');

  const values = (file) => new Map([...toMap(parseEnv(readFile(cwd, file, 'env')).entries)].map(([k, e]) => [k, e.value]));
  const diff = diffEnv(values(aPath), values(bPath));
  const changes = diff.added.length + diff.removed.length + diff.changed.length;

  if (flags.json) {
    const payload = flags.values ? diff : { ...diff, changed: diff.changed.map((x) => x.key) };
    out(`${JSON.stringify({ a: aPath, b: bPath, ...payload }, null, 2)}\n`);
    return changes ? 1 : 0;
  }

  if (!changes) {
    if (!flags.quiet) out(`${c.green('✔')} ${c.bold(aPath)} and ${c.bold(bPath)} define the same variables with the same values\n`);
    return 0;
  }

  const lines = [`${c.bold(aPath)} ${c.dim('→')} ${c.bold(bPath)}`, ''];
  for (const key of diff.removed) lines.push(`  ${c.red('-')} ${key}`);
  for (const key of diff.added) lines.push(`  ${c.green('+')} ${key}`);
  for (const { key, from, to } of diff.changed) {
    lines.push(`  ${c.yellow('~')} ${key}${flags.values ? c.dim(`  ${JSON.stringify(from)} → ${JSON.stringify(to)}`) : ''}`);
  }
  lines.push('');
  const summary = [
    `${diff.added.length} added`,
    `${diff.removed.length} removed`,
    `${diff.changed.length} changed`,
    `${diff.same.length} unchanged`,
  ].join(', ');
  lines.push(`${c.yellow('⚠')} ${summary}${flags.values ? '' : c.dim('  (values hidden; pass --values to show them)')}`);
  out(`${lines.join('\n')}\n`);
  return 1;
}

function runDocs({ cwd, flags, c, out, err }) {
  const examplePath = String(flags.example);
  const schema = parseSchema(readFile(cwd, examplePath, 'example'));
  if (schema.errors.length) {
    for (const e of schema.errors) err(`${c.red('✖')} ${examplePath}:${e.line} ${e.message}\n`);
    return 1;
  }

  const markdown = renderDocs(schema);
  if (!flags.inject) {
    out(markdown);
    return 0;
  }

  const target = String(flags.inject);
  const document = readFile(cwd, target, 'doc');
  const updated = injectDocs(document, markdown);
  if (updated === null) {
    throw new UsageError(`${target} has no ${START_MARKER} … ${END_MARKER} block to fill`);
  }
  if (updated === document) {
    if (!flags.quiet) out(`${c.green('✔')} ${c.bold(target)} is up to date\n`);
    return 0;
  }
  if (flags.check) {
    out(`${c.red('✖')} the environment table in ${c.bold(target)} is out of date. Run ${c.cyan(`envguard docs --inject ${target}`)}.\n`);
    return 1;
  }
  fs.writeFileSync(path.resolve(cwd, target), updated);
  out(`${c.green('✔')} updated the environment table in ${c.bold(target)}\n`);
  return 0;
}

function readFile(cwd, file, role) {
  const text = readFileOrNull(cwd, file);
  if (text !== null) return text;
  if (role === 'example') {
    throw new UsageError(`${file} not found. envguard needs an example file that declares your variables (see --example).`);
  }
  throw new UsageError(`${file} not found`);
}

function readFileOrNull(cwd, file) {
  try {
    return fs.readFileSync(path.resolve(cwd, file), 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw new UsageError(`cannot read ${file}: ${error.message}`);
  }
}

function usage() {
  return `envguard ${version} — keep your .env files honest

Usage
  envguard [check] [options]         Validate .env against .env.example
  envguard init [--force]            Create .env from .env.example
  envguard sync [--write]            Declare variables from .env that are missing in .env.example
  envguard diff <a> <b> [--values]   Compare the variables of two env files
  envguard docs [--inject FILE]      Render .env.example as a Markdown table

Options
  -e, --env FILE        Env file to validate (default: .env)
  -x, --example FILE    Example file that declares the variables (default: .env.example)
  -p, --process-env     Validate the current process environment instead of a file
      --strict          Treat warnings as errors (undeclared keys, duplicates, git hygiene)
      --allow-unknown   Do not report variables that the example file does not declare
      --no-git          Skip the check that the env file is ignored by git
      --json            Machine-readable output
  -q, --quiet           Print nothing when everything is fine
      --no-color        Disable colours (NO_COLOR is respected too)
  -w, --write           sync: append the missing variables to the example file
  -f, --force           init: overwrite an existing env file
      --values          diff: show values (hidden by default)
      --inject FILE     docs: fill the block between ${START_MARKER} and ${END_MARKER}
      --check           docs: with --inject, fail instead of writing when the block is stale
  -h, --help            Show this help
  -v, --version         Show the version

Exit codes
  0  everything is fine     1  problems found     2  usage error or unreadable file

Annotations (comments directly above a variable in .env.example)
  @type string|int|float|bool|url|email|port|json|uuid|enum     @enum a,b,c
  @pattern <regex>   @min N   @max N   @optional   @secret   @desc <text>
`;
}
