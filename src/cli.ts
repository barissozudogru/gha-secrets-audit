#!/usr/bin/env node

import path from 'path';
import process from 'process';
import { createRequire } from 'module';
import { auditWorkflows } from './index.js';
import type { AuditResult, IfConditionWarning, OverExposedSecret, DuplicateGroup } from './types.js';

// TTY-aware color support: only emit ANSI codes when stdout is a real terminal
const USE_COLOR = process.stdout.isTTY === true;

function c(code: string): string {
  return USE_COLOR ? code : '';
}

const RESET  = c('\x1b[0m');
const BOLD   = c('\x1b[1m');
const DIM    = c('\x1b[2m');
const RED    = c('\x1b[31m');
const GREEN  = c('\x1b[32m');
const YELLOW = c('\x1b[33m');
const CYAN   = c('\x1b[36m');
const WHITE  = c('\x1b[37m');

// Suppress unused-variable warnings — these are kept for future use
void RED;
void WHITE;

function getVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

interface ParsedArgs {
  workflowsPath: string;
  jsonOutput: boolean;
  strict: boolean;
  threshold: number;
  excludeSecrets: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let workflowsPath = path.join(process.cwd(), '.github', 'workflows');
  let jsonOutput = false;
  let strict = false;
  let threshold = 3;
  const excludeSecrets: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--path' || arg === '-p') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        console.error('Error: --path requires a directory argument');
        process.exit(1);
      }
      workflowsPath = path.resolve(next);
      i++;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--threshold' || arg === '-t') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        console.error('Error: --threshold requires a numeric argument');
        process.exit(1);
      }
      const parsed = parseInt(next, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error('Error: --threshold must be a positive integer');
        process.exit(1);
      }
      threshold = parsed;
      i++;
    } else if (arg === '--exclude' || arg === '-e') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        console.error('Error: --exclude requires a comma-separated list of secret names');
        process.exit(1);
      }
      excludeSecrets.push(...next.split(',').map((s) => s.trim()).filter(Boolean));
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(getVersion());
      process.exit(0);
    }
  }

  return { workflowsPath, jsonOutput, strict, threshold, excludeSecrets };
}

function printHelp(): void {
  console.log(`
${BOLD}gha-secrets-audit${RESET} - Audit GitHub Actions workflows for secret hygiene

${BOLD}USAGE${RESET}
  gha-secrets-audit [options]

${BOLD}OPTIONS${RESET}
  --path, -p <dir>          Path to workflows directory (default: .github/workflows)
  --json                    Output results as JSON for CI consumption
  --strict                  Exit with code 1 if any findings are detected
  --threshold, -t <n>       Over-exposure job threshold (default: 3)
  --exclude, -e <secrets>   Comma-separated list of secret names to ignore
  --version, -v             Print version
  --help, -h                Show this help

${BOLD}EXAMPLES${RESET}
  gha-secrets-audit
  gha-secrets-audit --path /path/to/repo/.github/workflows
  gha-secrets-audit --json
  gha-secrets-audit --strict
  gha-secrets-audit --threshold 5
  gha-secrets-audit --exclude GITHUB_TOKEN,NPM_TOKEN
`);
}

function line(char = '-', width = 72): string {
  return char.repeat(width);
}

function renderSecretTable(result: AuditResult): void {
  const entries = Object.values(result.secretMap);
  if (entries.length === 0) {
    console.log(`  ${DIM}No secrets referenced.${RESET}`);
    return;
  }

  const maxName = Math.max(20, ...entries.map((e) => e.name.length));
  const header = `  ${'SECRET NAME'.padEnd(maxName)}  ${'REFS'.padStart(4)}  ${'JOBS'.padStart(4)}  ${'FILES'.padStart(5)}  NOTE`;
  console.log(`${DIM}${header}${RESET}`);
  console.log(`  ${line('-', header.length - 2)}`);

  for (const usage of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const uniqueJobs = new Set(usage.references.map((r) => `${r.file}::${r.job}`)).size;
    const uniqueFiles = new Set(usage.references.map((r) => r.file)).size;
    const note = usage.isGithubToken ? `${DIM}(standard)${RESET}` : '';
    const nameColor = usage.isGithubToken ? DIM : '';
    console.log(
      `  ${nameColor}${usage.name.padEnd(maxName)}${RESET}  ${String(usage.references.length).padStart(4)}  ${String(uniqueJobs).padStart(4)}  ${String(uniqueFiles).padStart(5)}  ${note}`
    );
  }
}

function renderOverExposed(secrets: OverExposedSecret[], threshold: number): void {
  if (secrets.length === 0) {
    console.log(`  ${GREEN}None detected.${RESET}`);
    return;
  }

  for (const s of secrets) {
    console.log(`  ${YELLOW}${BOLD}${s.name}${RESET}`);
    console.log(`  ${DIM}Referenced in ${s.jobCount} job(s) across ${s.fileCount} file(s)${RESET}`);
    console.log(`  ${s.recommendation}`);

    const grouped: Record<string, string[]> = {};
    for (const ref of s.references) {
      const key = path.basename(ref.file);
      if (!grouped[key]) grouped[key] = [];
      const entry = `${ref.job} / ${ref.step} (line ${ref.line})`;
      if (!grouped[key].includes(entry)) grouped[key].push(entry);
    }

    for (const [file, usages] of Object.entries(grouped)) {
      console.log(`    ${CYAN}${file}${RESET}`);
      for (const u of usages) {
        console.log(`      ${DIM}${u}${RESET}`);
      }
    }
    console.log();
  }

  void threshold; // threshold is shown in the section header by the caller
}

function renderDuplicates(groups: DuplicateGroup[]): void {
  if (groups.length === 0) {
    console.log(`  ${GREEN}None detected.${RESET}`);
    return;
  }

  for (const g of groups) {
    console.log(`  ${YELLOW}${BOLD}[${g.names.join(', ')}]${RESET}`);
    console.log(`  ${g.reason}`);
    console.log();
  }
}

function renderIfConditionWarnings(warnings: IfConditionWarning[]): void {
  if (warnings.length === 0) {
    console.log(`  ${GREEN}None detected.${RESET}`);
    return;
  }

  for (const w of warnings) {
    console.log(`  ${YELLOW}${BOLD}${w.secretName}${RESET}`);
    console.log(`  ${DIM}${path.basename(w.file)} — job: ${w.job}, line ${w.line}${RESET}`);
    console.log(`  Condition: ${w.condition}`);
    console.log(`  ${YELLOW}Warning: secret values used in if: conditions are visible in GitHub Actions logs.${RESET}`);
    console.log();
  }
}

function renderSummary(result: AuditResult): void {
  const s = result.summary;
  const hasIssues =
    s.overExposedCount > 0 || s.duplicateGroupCount > 0 || s.ifConditionWarningCount > 0;

  console.log(`  Workflows scanned  : ${s.workflowsScanned}`);
  console.log(`  Unique secrets     : ${s.uniqueSecrets}`);
  console.log(`  GITHUB_TOKEN refs  : ${s.githubTokenCount}`);

  const overColor = s.overExposedCount > 0 ? YELLOW : GREEN;
  const dupColor = s.duplicateGroupCount > 0 ? YELLOW : GREEN;
  const ifColor = s.ifConditionWarningCount > 0 ? YELLOW : GREEN;

  console.log(`  Over-exposed       : ${overColor}${s.overExposedCount}${RESET}`);
  console.log(`  Duplicate groups   : ${dupColor}${s.duplicateGroupCount}${RESET}`);
  console.log(`  if: cond. warnings : ${ifColor}${s.ifConditionWarningCount}${RESET}`);
  console.log();

  console.log(`${BOLD}  Recommendations${RESET}`);
  for (const rec of s.recommendations) {
    const icon = hasIssues ? `${YELLOW}!${RESET}` : `${GREEN}+${RESET}`;
    console.log(`  ${icon} ${rec}`);
  }
}

function renderPretty(result: AuditResult, workflowsDir: string, threshold: number): void {
  console.log();
  console.log(`${BOLD}${CYAN}gha-secrets-audit${RESET}`);
  console.log(`${DIM}Scanning: ${workflowsDir}${RESET}`);
  console.log(`${DIM}${line()}${RESET}`);

  console.log();
  console.log(`${BOLD}REFERENCED SECRETS${RESET}`);
  renderSecretTable(result);

  console.log();
  console.log(`${BOLD}OVER-EXPOSED SECRETS${RESET}`);
  console.log(`${DIM}Secrets used in ${threshold}+ jobs may violate least-privilege principle${RESET}`);
  console.log();
  renderOverExposed(result.overExposedSecrets, threshold);

  console.log();
  console.log(`${BOLD}DUPLICATE PATTERNS${RESET}`);
  console.log(`${DIM}Secrets with similar names may be redundant or inconsistently named${RESET}`);
  console.log();
  renderDuplicates(result.duplicateGroups);

  console.log();
  console.log(`${BOLD}IF-CONDITION SECRET USAGE${RESET}`);
  console.log(`${DIM}Secrets referenced in if: conditions are exposed in workflow logs${RESET}`);
  console.log();
  renderIfConditionWarnings(result.ifConditionWarnings);

  console.log();
  console.log(`${BOLD}HYGIENE SUMMARY${RESET}`);
  console.log();
  renderSummary(result);
  console.log();
  console.log(`${DIM}${line()}${RESET}`);
  console.log();
}

async function main(): Promise<void> {
  const { workflowsPath, jsonOutput, strict, threshold, excludeSecrets } = parseArgs(process.argv);

  const result = auditWorkflows({
    workflowsDir: workflowsPath,
    overExposureThreshold: threshold,
    excludeSecrets,
  });

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    renderPretty(result, workflowsPath, threshold);
  }

  if (strict) {
    const hasFindings =
      result.overExposedSecrets.length > 0 ||
      result.duplicateGroups.length > 0 ||
      result.ifConditionWarnings.length > 0;
    if (hasFindings) {
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
