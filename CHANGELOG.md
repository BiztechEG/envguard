# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- envguard now requires Node.js 20 or newer. Node 18 reached end of life in April 2025. CI tests Node 20, 22 and 24.
- The GitHub Action runs the copy of envguard that ships with it instead of downloading it from npm. Its version always matches the ref in `uses:`, and the `version` input was removed. The `args` input no longer expands shell wildcards.

### Fixed

- Trailing spaces on the first line of a multi-line quoted value are kept. They used to be trimmed away.
- A commented-out variable such as `# REDIS_URL=redis://localhost` directly above another variable no longer becomes that variable's description.
- `envguard docs --inject` ignores markers inside fenced code blocks and requires each marker on its own line. A README that showed the markers as an example used to get the table injected into that example.
- An unterminated quote no longer swallows the rest of the file; parsing resumes on the next line, so later variables are not reported as missing.
- `@type url` now requires a scheme followed by `//`. Values such as `localhost:3000` were accepted before.
- `@pattern /regex/flags` now honours the flags. Before, the whole text including the slashes and flags was used as the expression, so nothing matched.
- Syntax errors no longer quote the offending line. A malformed line is often part of a secret, such as an unquoted multi-line private key, and the text ended up in CI logs.
- The git check no longer warns about env files outside the current repository. Git now runs from the env file's own directory.

## [0.1.0] - 2026-10-08

### Added

- `envguard check`: validate `.env` (or the process environment with `--process-env`) against an annotated `.env.example`.
- Annotations: `@type` (`string`, `int`, `float`, `bool`, `url`, `email`, `port`, `json`, `uuid`, `enum`), `@enum`, `@pattern`, `@min`, `@max`, `@optional`, `@required`, `@secret`, `@desc`.
- Git hygiene warning when the env file is tracked by git or not ignored.
- `envguard init`, `envguard sync`, `envguard diff` and `envguard docs` (with `--inject` and `--check`).
- `--strict`, `--allow-unknown`, `--no-git`, `--json`, `--quiet`, `--no-color` flags.
- Programmatic API exported from the package root.
- Composite GitHub Action (`action.yml`).

[Unreleased]: https://github.com/BiztechEG/envguard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/BiztechEG/envguard/releases/tag/v0.1.0
