# gha-secrets-audit

A CLI that audits GitHub Actions workflow files for secret hygiene issues.

## What it does

Scans `.github/workflows/*.yml` files and reports:

- **Referenced secrets** - every secret reference mapped to its file, job, step, and line
- **Over-exposed secrets** - secrets referenced in 3+ jobs, violating least-privilege
- **Duplicate patterns** - secrets with similar names that may be redundant or inconsistently named
- **Hygiene summary** - counts and actionable recommendations

## Installation

```bash
npm install -g @barissozudogru/gha-secrets-audit
```

Or use directly via npx:

```bash
npx @barissozudogru/gha-secrets-audit
```

## Usage

```bash
# Scan .github/workflows/ in current directory
gha-secrets-audit

# Scan a custom path
gha-secrets-audit --path /path/to/repo/.github/workflows

# JSON output for CI pipelines
gha-secrets-audit --json

# Exit with code 1 if any findings are detected (for CI enforcement)
gha-secrets-audit --strict

# Combine flags
gha-secrets-audit --path ./workflows --json --strict

# Raise the over-exposure threshold to 5 jobs
gha-secrets-audit --threshold 5

# Exclude specific secrets from all findings
gha-secrets-audit --exclude GITHUB_TOKEN,NPM_TOKEN

# Combine threshold and exclusions with strict mode
gha-secrets-audit --threshold 5 --exclude GITHUB_TOKEN --strict
```

## Options

| Flag | Alias | Description |
|------|-------|-------------|
| `--path <dir>` | `-p` | Custom workflows directory (default: `.github/workflows`) |
| `--json` | | Output results as JSON |
| `--strict` | | Exit 1 on any finding (over-exposed, duplicate, or if-condition) |
| `--threshold <n>` | `-t` | Number of jobs a secret must appear in before it is flagged as over-exposed (default: `3`) |
| `--exclude <names>` | `-e` | Comma-separated list of secret names to omit from all findings |
| `--version` | `-v` | Print version |
| `--help` | `-h` | Show help |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Scan completed — no issues found, or `--strict` not set |
| `1` | `--strict` is set and at least one finding was detected (over-exposed secret, duplicate group, or if-condition warning) |
| `1` | Fatal error (unreadable path, invalid arguments, etc.) |

## Example output

```
gha-secrets-audit
Scanning: /repo/.github/workflows

REFERENCED SECRETS
  SECRET NAME           REFS  JOBS  FILES  NOTE
  -------------------------------------------------------
  DEPLOY_KEY               4     4      2
  GITHUB_TOKEN             2     2      1  (standard)
  NPM_TOKEN                1     1      1
  SLACK_WEBHOOK            3     3      1

OVER-EXPOSED SECRETS
Secrets used in 3+ jobs may violate least-privilege principle

  SLACK_WEBHOOK
  Referenced in 3 job(s) across 1 file(s)
  ...

HYGIENE SUMMARY
  Workflows scanned  : 3
  Unique secrets     : 4
  GITHUB_TOKEN refs  : 2
  Over-exposed       : 1
  Duplicate groups   : 0

  Recommendations
  ! Review 1 over-exposed secret(s) and restrict their scope...
```

## CI integration

Add to your workflow to enforce secret hygiene on every PR:

```yaml
- name: Audit secrets hygiene
  run: npx @barissozudogru/gha-secrets-audit --strict
```

## License

MIT
