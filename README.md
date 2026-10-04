# gha-secrets-audit

[![npm version](https://img.shields.io/npm/v/@barissozudogru/gha-secrets-audit)](https://www.npmjs.com/package/@barissozudogru/gha-secrets-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

[npm](https://www.npmjs.com/package/@barissozudogru/gha-secrets-audit) · [Source](https://github.com/barissozudogru/gha-secrets-audit) · [Issues](https://github.com/barissozudogru/gha-secrets-audit/issues)

Static analysis tool for GitHub Actions workflow files to inspect secret usage and detect hygiene issues. It runs entirely offline without reading secret values or making network calls.


## Quick Start

```bash
# Run without installing
npx @barissozudogru/gha-secrets-audit

# Or install globally
npm install -g @barissozudogru/gha-secrets-audit
```

## Detection Rules

The scanner maps every secret reference across workflow files by file, job, step, and line number, checking for:

- **Over-exposed secrets**: Credentials referenced in 3 or more jobs (configurable via `--threshold`). Review whether each job needs access.
- **Unsupported conditions**: Direct secret references inside `if:` conditions. [GitHub does not support this syntax](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
- **Name similarity**: Near-duplicate or base-name matched secret names that warrant review. Names alone do not establish duplicate values or credentials.
- **Shell interpolation**: Secret expressions embedded directly in `run:` commands; review quoting and use environment variables where appropriate.


## Usage

```bash
# Scan .github/workflows/ in the current directory
gha-secrets-audit

# Scan a specific workflows directory
gha-secrets-audit --path /path/to/repo/.github/workflows

# Output JSON for downstream tooling
gha-secrets-audit --json

# Exit with code 1 if any findings are detected (CI enforcement)
gha-secrets-audit --strict

# Raise the over-exposure threshold to 5 jobs
gha-secrets-audit --threshold 5

# Exclude specific secrets from all findings
gha-secrets-audit --exclude GITHUB_TOKEN,NPM_TOKEN

# Combine flags
gha-secrets-audit --path ./workflows --threshold 5 --exclude GITHUB_TOKEN --strict
```

## Options

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--path <dir>` | `-p` | `.github/workflows` | Path to the workflows directory to scan |
| `--json` | | `false` | Output results as JSON instead of human-readable text |
| `--strict` | | `false` | Exit with code `1` if any finding is detected |
| `--threshold <n>` | `-t` | `3` | Minimum number of jobs a secret must appear in to be flagged as over-exposed |
| `--exclude <names>` | `-e` | | Comma-separated list of secret names to omit from all findings |
| `--version` | `-v` | | Print the installed version |
| `--help` | `-h` | | Show help text |

## Output and limits

The report lists referenced secret names and their locations, followed by review
findings and a summary. `--json` provides structured results for automation.

Findings are static review hints. The scanner cannot inspect secret values,
repository permissions, environment protections, or execution logs. A finding does
not prove exposure, and a clean report does not establish that a workflow is secure.
Review intentional reuse before enforcing `--strict`; use `--exclude` for accepted
exceptions.

## CI Integration

Add the audit step to your pull request workflow to enforce secret hygiene on every PR:

```yaml
name: Security

on:
  pull_request:

jobs:
  secret-hygiene:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Audit secrets hygiene
        run: npx @barissozudogru/gha-secrets-audit --strict
```

With `--strict`, the job exits `1` when any finding is detected. Configure the job as a required status check if you want it to gate pull request merges.

To exclude known-acceptable secrets from the check:

```yaml
- name: Audit secrets hygiene
  run: npx @barissozudogru/gha-secrets-audit --strict --exclude GITHUB_TOKEN
```

## Exit Codes

| Code | Condition |
|------|-----------|
| `0` | Scan completed successfully with no findings, or `--strict` was not set |
| `1` | `--strict` is set and at least one finding was detected (over-exposed secret, duplicate group, if-condition warning, or secret interpolated into a `run:` command) |
| `1` | Fatal error: unreadable path, invalid argument, or filesystem failure |

## Development and support

Report problems through [GitHub issues](https://github.com/barissozudogru/gha-secrets-audit/issues). See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow. For vulnerabilities, follow [SECURITY.md](./SECURITY.md).

To build and test a source checkout with Node.js 22:

```bash
npm ci
npm test
npm run build
```

The default branch can contain changes that have not yet been published to npm.

## License

[MIT](LICENSE)
