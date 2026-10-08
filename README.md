# envguard

> Keep your `.env` files honest.

`envguard` turns the `.env.example` you already have into a schema. It checks that `.env` (or the real process environment in CI) declares every variable, that each value has the right shape, generates documentation from it, and warns you before a `.env` full of secrets ends up in git.

Zero dependencies. One file to annotate. Works with any language or framework, because it only reads files.

```
$ npx envguard

.env ← .env.example

  ✖  NODE_ENV       expected one of development, production, test, got "staging"  .env:1
  ✖  PORT           expected a port number (1-65535), got "80800"  .env:2
  ✖  DATABASE_URL   is empty (required)  .env:4
  ✖  SUPPORT_EMAIL  expected an email address, got "support at example dot com"  .env:6
  ⚠  LEGACY_TOKEN   is not declared in the example file  .env:8
  ⚠                 .env is not ignored by git; add it to .gitignore so it cannot be committed by accident

✖ 4 errors, 2 warnings (9 variables)
```

[العربية](./README.ar.md)

## Why

Every project has a `.env.example`. Almost none of them are enforced. New teammates copy it, miss a variable, and lose an afternoon to a `undefined is not a function` that was really a missing `DATABASE_URL`. CI breaks because production has `PORT=80800`. Somebody commits `.env`.

Libraries like `envalid` or `zod` solve this inside one codebase, in one language. `envguard` solves it at the file level, so the same `.env.example` protects your Node API, your Python worker, your Docker Compose file and your CI pipeline.

## Install

```sh
npm install --save-dev envguard   # or: pnpm add -D envguard / yarn add -D envguard
npx envguard --help
```

Requires Node.js 18 or newer. There is nothing else to install.

## Quick start

1. Annotate your `.env.example` with comments. Everything is optional; an unannotated variable is simply "required, any string".

   ```dotenv
   # Environment the app runs in
   # @enum development,production,test
   NODE_ENV=development

   # Port the HTTP server listens on
   # @type port
   PORT=3000

   # PostgreSQL connection string
   # @type url @secret
   DATABASE_URL=

   # Error reporting; leave empty to disable
   # @type url @optional @secret
   SENTRY_DSN=

   # Feature flags as a JSON object
   # @type json @optional
   FEATURE_FLAGS={"newDashboard":false}
   ```

2. Run the check.

   ```sh
   npx envguard            # validates .env against .env.example
   npx envguard --strict   # warnings fail the build too
   ```

3. Wire it into the places where a broken environment hurts most: a `pretest`/`predev` script, a pre-commit hook, or CI.

## Annotations

Write them in the comment block directly above a variable (no blank line in between). Plain comment text becomes the description; several annotations can share a line.

| Annotation | Meaning |
| --- | --- |
| `@type <t>` | Expected shape. One of `string` (default), `int`, `float`, `bool`, `url`, `email`, `port`, `json`, `uuid`, `enum`. |
| `@enum a,b,c` | Allowed values. Implies `@type enum`. |
| `@pattern <regex>` | JavaScript regular expression the value must match. Uses the rest of the line, so it may contain spaces and `@`. |
| `@min N` / `@max N` | Bounds. Numeric for `int`, `float` and `port`; length in characters for everything else. |
| `@optional` | The variable may be missing or empty. When it is set, it is still validated. |
| `@required` | The default. Written out when you want to be explicit. |
| `@secret` | The value is sensitive. It is never echoed in messages and is hidden in generated docs. |
| `@desc <text>` | Description. Plain comment text does the same thing. |

Accepted booleans: `true/false`, `1/0`, `yes/no`, `on/off` (case-insensitive). An `@` glued to a word, as in `ops@example.com`, is not an annotation. Unknown annotations are reported as warnings, so typos do not go unnoticed.

## Commands

### `envguard check` (default)

Validate an env file against the example file.

```sh
envguard                         # .env against .env.example
envguard -e .env.production      # another env file
envguard -x config/schema.env    # another example file
envguard --process-env           # validate the real environment (for CI and containers)
envguard --strict                # treat warnings as errors
envguard --allow-unknown         # do not report variables the example does not declare
envguard --no-git                # skip the git hygiene check
envguard --json                  # machine-readable report
envguard --quiet                 # print nothing when everything is fine
```

What it reports:

| Code | Level | Meaning |
| --- | --- | --- |
| `missing` | error | A required variable is not set. |
| `empty` | error | A required variable is set to an empty string. |
| `invalid` | error | The value does not match its `@type`, `@enum`, `@pattern`, `@min` or `@max`. |
| `syntax` | error | A line in the env file is not valid dotenv syntax. |
| `schema` | error / warning | The example file itself is broken (unknown type, bad regex) or uses an unknown annotation. |
| `unknown` | warning | The env file sets a variable the example does not declare. Run `envguard sync` to declare it. |
| `duplicate` | warning | A variable is defined twice; the last value wins. |
| `git` | warning | The env file is tracked by git or not ignored by it. |

Exit codes: `0` everything is fine, `1` problems were found, `2` usage error or unreadable file.

### `envguard init`

Create `.env` from `.env.example`. Refuses to overwrite an existing file unless you pass `--force`.

### `envguard sync`

List variables that are set in `.env` but never declared in `.env.example`. With `--write` they are appended as empty declarations so you can document them. Exits with `1` when the files are out of sync, which makes it a good pre-commit check.

### `envguard diff <a> <b>`

Compare the variables of two env files: added, removed, changed, unchanged. Values are hidden unless you pass `--values`, so it is safe to paste the output into an issue. Supports `--json`.

### `envguard docs`

Render `.env.example` as a Markdown table. With `--inject README.md` it replaces the block between two markers in that file, and `--check` fails instead of writing when the block is stale.

```md
<!-- envguard:start -->
<!-- envguard:end -->
```

The table for the example above looks like this:

| Variable | Required | Type | Example | Description |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | yes | enum: `development`, `production`, `test` | `development` | Environment the app runs in |
| `PORT` | yes | port | `3000` | Port the HTTP server listens on |
| `DATABASE_URL` | yes | url | _(secret)_ | PostgreSQL connection string |
| `SENTRY_DSN` | no | url | _(secret)_ | Error reporting; leave empty to disable |
| `FEATURE_FLAGS` | no | json | `{"newDashboard":false}` | Feature flags as a JSON object |

## Using it in CI

In CI there is usually no `.env` file; the configuration comes from real environment variables or secrets. `--process-env` validates those against the same example file.

```yaml
# .github/workflows/ci.yml
- name: Validate environment
  run: npx envguard check --process-env --strict
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    NODE_ENV: test
```

Or use the bundled action:

```yaml
- uses: BiztechEG/envguard@main
  with:
    process-env: true
    strict: true
```

Two other checks that are worth running in CI: `envguard sync` (nobody added a variable without documenting it) and `envguard docs --inject README.md --check` (the README table is current).

## Using it as a pre-commit hook

```sh
# .husky/pre-commit, lefthook, or plain .git/hooks/pre-commit
npx envguard check --strict --quiet && npx envguard sync --quiet
```

## Programmatic API

```js
import fs from 'node:fs';
import { parseSchema, parseEnv, envFromParsed, check } from 'envguard';

const schema = parseSchema(fs.readFileSync('.env.example', 'utf8'));
const env = envFromParsed(parseEnv(fs.readFileSync('.env', 'utf8')));
const report = check({ schema, env, unknownKeys: 'warn' });

if (!report.ok) {
  for (const problem of report.problems) console.error(problem.key, problem.message);
  process.exit(1);
}
```

Also exported: `envFromProcess`, `validateValue`, `diffEnv`, `renderDocs`, `injectDocs`, `missingFromExample`, `appendToExample`, `toMap`, `toObject` and `run` (the CLI entry point, handy for tests).

## Dotenv syntax that is understood

```dotenv
KEY=value
export KEY=value
KEY="double quoted"      # supports \n \r \t \" \\ escapes and may span several lines
KEY='single quoted'      # taken literally
KEY=value # inline comment, only when the # follows whitespace
KEY=                     # empty
```

Variable names must match `[A-Za-z_][A-Za-z0-9_]*`. `${VAR}` interpolation is left untouched: the literal text is validated.

## Comparison

| | envguard | dotenv-linter | envalid / zod | dotenv-safe |
| --- | --- | --- | --- | --- |
| Validates value types and ranges | yes | no | yes | no |
| Language agnostic (checks files, not code) | yes | yes | no | no |
| Schema lives in `.env.example` | yes | n/a | no | partly |
| Checks the real process env in CI | yes | no | yes | yes |
| Generates docs | yes | no | no | no |
| Git hygiene warning | yes | no | no | no |
| Runtime dependencies | 0 | binary | 1+ | 1+ |

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how the project is laid out and how to run the tests (`npm test`, no setup required).

## License

[MIT](./LICENSE)
