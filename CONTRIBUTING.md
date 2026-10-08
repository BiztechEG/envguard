# Contributing to envguard

Thanks for taking the time. Bug reports, feature ideas, documentation fixes and code are all welcome.

## Ground rules

- **Zero runtime dependencies.** This is a deliberate design choice. Pull requests that add one will be asked to inline the functionality instead.
- **Node.js 18+.** Use only APIs available in Node 18 (`node:test`, `node:util.parseArgs`, ES modules).
- **Never print secret values.** Anything that might echo a value must respect the `@secret` flag.
- **Keep the CLI predictable.** Exit codes are part of the contract: `0` fine, `1` problems found, `2` usage error.

## Getting started

```sh
git clone https://github.com/BiztechEG/envguard.git
cd envguard
npm test          # runs the whole suite with node:test, no install step needed
npm run lint      # syntax, trailing whitespace, indentation
npm run demo      # runs the CLI against examples/basic
```

Try the CLI directly while developing:

```sh
node bin/envguard.js check -e examples/basic/.env -x examples/basic/.env.example --no-git
```

## Project layout

| Path | What lives there |
| --- | --- |
| `bin/envguard.js` | Executable entry point. Only calls `run()` from the CLI module. |
| `src/parse-env.js` | Dotenv parser. Never throws; collects errors with line numbers. |
| `src/schema.js` | Turns an annotated `.env.example` into rules. |
| `src/validate.js` | Validates one value against one rule. |
| `src/check.js` | Pure comparison of env values against a schema; produces the report. |
| `src/diff.js`, `src/docs.js`, `src/sync.js` | The `diff`, `docs` and `sync` commands' logic, also pure. |
| `src/git.js` | The only module that shells out (to `git`). Fails soft. |
| `src/format.js` | Colours and human-readable report rendering. |
| `src/cli.js` | Argument parsing, file I/O and wiring. Everything above is testable without it. |
| `src/index.js` | Public API surface. |
| `test/` | One test file per module plus `cli.test.js` for end-to-end behaviour in temp directories. |
| `examples/` | Sample files used by `npm run demo` and the README. |

Keep the pure modules pure: no file system, no `process`, no terminal. That is what makes the programmatic API usable and the tests fast.

## Adding a type or annotation

1. Add the validator in `src/validate.js` and the name to `TYPES` (or the tag to `applyTag`) in `src/schema.js`.
2. Add cases to `test/validate.test.js` and `test/schema.test.js`.
3. Document it in the README table (both `README.md` and `README.ar.md`) and in the `usage()` text in `src/cli.js`.
4. Add a line to `CHANGELOG.md` under *Unreleased*.

## Pull requests

- One topic per pull request.
- Add or update tests for behaviour you change. `npm run check` must pass.
- Write a short description of *why*, not just *what*. Include a before/after snippet of CLI output when it changes.
- Follow the existing code style: two-space indentation, single quotes, semicolons, descriptive names, JSDoc on exported functions.

## Reporting bugs

Open an issue with the smallest `.env.example` and `.env` that reproduce the problem, the command you ran, the output you got, and your Node.js version (`node --version`). Please redact real secrets.

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). Be kind.
