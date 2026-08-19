# Contributing

Contributions are welcome. This document covers how to set up the project locally, the conventions used, and the process for submitting changes.

## Prerequisites

- Node.js >= 18
- npm >= 9

## Setup

```bash
git clone https://github.com/barissozudogru/gha-secrets-audit.git
cd gha-secrets-audit
npm install
```

## Development

Source files are in `src/`. The project uses TypeScript with `"type": "module"`.

```bash
# Compile TypeScript to dist/
npm run build

# Run the compiled CLI against this repo's own workflows
node dist/cli.js --path .github/workflows

# Watch mode (if added - currently run build manually)
npm run build
```

## Project Structure

```
src/
  types.ts     - shared interfaces (SecretReference, AuditResult, etc.)
  index.ts     - core audit logic (parsing, detection, aggregation)
  cli.ts       - CLI entry point, argument parsing, terminal rendering
dist/          - compiled output (do not edit)
```

## Conventions

- **No runtime dependencies.** The tool uses only Node.js built-ins (`fs`, `path`, `process`). Keep it that way.
- **TypeScript strict mode.** `tsconfig.json` enables `strict`. No `any` without a comment explaining why.
- **Regex patterns** for secret extraction live at the top of `index.ts` and are documented inline.
- **Pure functions** where possible. `parseWorkflowFile` returns data; rendering is left to `cli.ts`.
- **No network calls.** This tool is intentionally offline-only.

## Adding a Detection Rule

1. Define the new finding type in `src/types.ts` (interface + field on `AuditResult` and `AuditSummary`).
2. Implement the detection function in `src/index.ts`. Keep detection logic separate from rendering.
3. Wire the new field into `auditWorkflows()` return value and summary.
4. Add a render function in `src/cli.ts` and call it from `renderPretty()`.
5. Update the `--strict` exit condition in `main()` if the new finding should block CI.
6. Add an entry to `CHANGELOG.md`.

## Submitting a Pull Request

1. Fork the repository and create a branch from `main`.
2. Make your changes and run `npm run build` to verify compilation.
3. Test manually against a local workflow directory.
4. Open a pull request with a clear description of what changed and why.
5. Reference any related issue in the PR description.

## Reporting Bugs

Open a [GitHub issue](https://github.com/barissozudogru/gha-secrets-audit/issues) with:
- The command you ran
- The relevant workflow YAML (redact any real secret names if needed)
- The actual output vs. what you expected

For security vulnerabilities, follow the process in [SECURITY.md](SECURITY.md) instead.
