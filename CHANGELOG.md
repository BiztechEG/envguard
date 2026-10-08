# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- An unterminated quote no longer swallows the rest of the file; parsing resumes on the next line, so later variables are not reported as missing.
- `@type url` now requires a scheme followed by `//`. Values such as `localhost:3000` were accepted before.
- `@pattern /regex/flags` now honours the flags. Before, the whole text including the slashes and flags was used as the expression, so nothing matched.

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
