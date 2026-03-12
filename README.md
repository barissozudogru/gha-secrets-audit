<h1 align="center">gha-secrets-audit</h1>

<p align="center">
  Find exposed, unused, and mismanaged secrets in your GitHub Actions workflows.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat" alt="MIT License">
  <img src="https://img.shields.io/badge/Zero_Dependencies-brightgreen?style=flat" alt="Zero Dependencies">
</p>

---

## What It Does

`gha-secrets-audit` is a zero-dependency CLI that performs static analysis of your `.github/workflows` YAML files. It maps every secret reference to the exact file, job, step, and line number — then flags patterns that violate least-privilege or create security risk.

No network access. No API calls. No secret values are read or transmitted.

## What It Detects

**Over-exposed secrets** — secrets referenced across too many jobs, violating least-privilege. A secret used in 3+ jobs (configurable) is flagged with a breakdown of where it appears.

**If-condition leaks** — secrets referenced inside `if:` conditions are evaluated and their resolved values appear in GitHub Actions workflow logs, making them visible to anyone with log access.

**Cross-workflow secret mapping** — every secret reference is mapped across all workflow files with its file, job, step, and line number so you can see the full blast radius of each credential.

**Hygiene issues** — duplicate or near-duplicate secret names that suggest credential sprawl, inconsistent naming conventions, or overlooked consolidation opportunities.

## Quick Start

```bash
# Run without installing
npx @barissozudogru/gha-secrets-audit

# Or install globally
npm install -g @barissozudogru/gha-secrets-audit
```

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

## Example Output

```
gha-secrets-audit
Scanning: /repo/.github/workflows
------------------------------------------------------------------------

REFERENCED SECRETS
  SECRET NAME              REFS  JOBS  FILES  NOTE
  -------------------------------------------------------
  AWS_ACCESS_KEY_ID           5     5      3
  AWS_SECRET_ACCESS_KEY       5     5      3
  DEPLOY_SSH_KEY              2     2      1
  GITHUB_TOKEN                3     3      2  (standard)
  NPM_TOKEN                   1     1      1
  SLACK_WEBHOOK               4     4      2

OVER-EXPOSED SECRETS
Secrets used in 3+ jobs may violate least-privilege principle

  AWS_ACCESS_KEY_ID
  Referenced in 5 job(s) across 3 file(s)
  Secret "AWS_ACCESS_KEY_ID" is referenced in 5 jobs across 3 workflow(s).
  Consider scoping it to only the jobs that require it, or splitting into
  more specific secrets per integration.
    deploy.yml
      build / step-1 (line 34)
      publish / step-2 (line 67)
    release.yml
      release / step-1 (line 22)

  SLACK_WEBHOOK
  Referenced in 4 job(s) across 2 file(s)
  ...

IF-CONDITION SECRET USAGE

  AWS_SECRET_ACCESS_KEY
  deploy.yml - job: validate, line 41
  Condition: ${{ secrets.AWS_SECRET_ACCESS_KEY != '' }}
  Warning: secret values used in if: conditions are visible in GitHub Actions logs.

DUPLICATE PATTERNS
Secrets with similar names may be redundant or inconsistently named

  [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY]
  These secrets share the base name "AWS" and may represent the same
  credential under different naming conventions, or could be consolidated.

HYGIENE SUMMARY

  Workflows scanned  : 3
  Unique secrets     : 6
  GITHUB_TOKEN refs  : 3
  Over-exposed       : 2
  Duplicate groups   : 1
  if: cond. warnings : 1

  Recommendations
  ! Review 2 over-exposed secret(s) and restrict their scope to only the jobs that require them.
  ! Investigate 1 potential duplicate secret group(s) to reduce credential sprawl.
  ! 1 secret(s) used in "if:" conditions — these values may be exposed in GitHub Actions logs.

------------------------------------------------------------------------
```

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

With `--strict`, the job exits `1` and blocks the PR merge if any over-exposed secrets, duplicate groups, or if-condition warnings are detected.

To exclude known-acceptable secrets from the check:

```yaml
- name: Audit secrets hygiene
  run: npx @barissozudogru/gha-secrets-audit --strict --exclude GITHUB_TOKEN
```

## Exit Codes

| Code | Condition |
|------|-----------|
| `0` | Scan completed successfully with no findings, or `--strict` was not set |
| `1` | `--strict` is set and at least one finding was detected (over-exposed secret, duplicate group, or if-condition warning) |
| `1` | Fatal error — unreadable path, invalid argument, or filesystem failure |

## License

[MIT](LICENSE)
