# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-12

### Added
- `--exclude` / `-e` flag to omit specific secrets from all findings by name
- `--threshold` / `-t` flag to configure the over-exposure job count threshold (default: 3)
- If-condition leak detection: secrets referenced inside `if:` expressions are flagged because their resolved values appear in workflow logs
- `ifConditionWarnings` field in JSON output
- `ifConditionWarningCount` in the hygiene summary
- TTY-aware color output: ANSI codes are only emitted when stdout is a real terminal, making piped and CI output clean

### Changed
- Over-exposure references now include a per-file breakdown of job and step locations
- Summary recommendations use `!` prefix for issues and `+` prefix for clean results
- JSON output includes `workflowFiles` array listing all scanned file paths

## [0.2.0] - 2026-03-10

### Added
- Duplicate pattern detection: groups secrets sharing a base name or close prefix to surface credential sprawl
- `duplicateGroups` field in JSON output
- `--strict` flag exits with code `1` when any finding is detected, enabling CI enforcement

### Changed
- Secret table now shows separate REFS, JOBS, and FILES columns
- `GITHUB_TOKEN` references are annotated as `(standard)` and excluded from over-exposure checks

## [0.1.0] - 2026-03-08

### Added
- Initial release
- Static analysis of `.github/workflows/*.yml` and `.yaml` files
- Secret reference extraction from `${{ secrets.NAME }}` and `${{ secrets['NAME'] }}` patterns
- Over-exposed secret detection: secrets referenced in 3+ distinct jobs
- Hygiene summary with actionable recommendations
- `--path` flag for custom workflow directory
- `--json` flag for machine-readable output
- `--version` and `--help` flags
- Zero runtime dependencies
