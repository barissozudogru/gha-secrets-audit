#!/usr/bin/env node

import path from 'path';
import process from 'process';
import { auditWorkflows } from './index.js';
import type { AuditResult, OverExposedSecret, DuplicateGroup } from './types.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

function parseArgs(argv: string[]): {
  workflowsPath: string;
  jsonOutput: boolean;
  strict: boolean;
} {
  const args = argv.slice(2);
  let workflowsPath = path.join(process.cwd(), '.github', 'workflows');
  let jsonOutput = false;
  let strict = false;

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
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log('0.1.0');
      process.exit(0);
    }
  }

  return { workflowsPath, jsonOutput, strict };
}

function printHelp(): void {
  console.log(`
${BOLD}gha-secrets-audit${RESET} - Audit GitHub Actions workflows for secret hygiene

${BOLD}USAGE${RESET}
  gha-secrets-audit [options]

${BOLD}OPTIONS${RESET}
  --path, -p <dir>    Path to workflows directory (default: .github/workflows)
  --json              Output results as JSON for CI consumption
  --strict            Exit with code 1 if any findings are detected
  --version, -v       Print version
  --help, -h          Show this help

${BOLD}EXAMPLES${RESET}
  gha-secrets-audit
  gha-secrets-audit --path /path/to/repo/.github/workflows
  gha-secrets-audit --json
  gha-secrets-audit --strict
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
    const nameColor = usage.isGithubToken ? DIM : WHITE;
    console.log(
      `  ${nameColor}${usage.name.padEnd(maxName)}${RESET}  ${String(usage.references.length).padStart(4)}  ${String(uniqueJobs).padStart(4)}  ${String(uniqueFiles).padStart(5)}  ${note}`
    );
  }
}

function renderOverExposed(secrets: OverExposedSecret[]): void {
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

function renderSummary(result: AuditResult): void {
  const s = result.summary;
  const hasIssues = s.overExposedCount > 0 || s.duplicateGroupCount > 0;

  console.log(`  Workflows scanned  : ${s.workflowsScanned}`);
  console.log(`  Unique secrets     : ${s.uniqueSecrets}`);
  console.log(`  GITHUB_TOKEN refs  : ${s.githubTokenCount}`);

  const overColor = s.overExposedCount > 0 ? YELLOW : GREEN;
  const dupColor = s.duplicateGroupCount > 0 ? YELLOW : GREEN;

  console.log(`  Over-exposed       : ${overColor}${s.overExposedCount}${RESET}`);
  console.log(`  Duplicate groups   : ${dupColor}${s.duplicateGroupCount}${RESET}`);
  console.log();

  console.log(`${BOLD}  Recommendations${RESET}`);
  for (const rec of s.recommendations) {
    const icon = hasIssues ? `${YELLOW}!${RESET}` : `${GREEN}+${RESET}`;
    console.log(`  ${icon} ${rec}`);
  }
}

function renderPretty(result: AuditResult, workflowsDir: string): void {
  console.log();
  console.log(`${BOLD}${CYAN}gha-secrets-audit${RESET}`);
  console.log(`${DIM}Scanning: ${workflowsDir}${RESET}`);
  console.log(`${DIM}${line()}${RESET}`);

  console.log();
  console.log(`${BOLD}REFERENCED SECRETS${RESET}`);
  renderSecretTable(result);

  console.log();
  console.log(`${BOLD}OVER-EXPOSED SECRETS${RESET}`);
  console.log(`${DIM}Secrets used in ${3}+ jobs may violate least-privilege principle${RESET}`);
  console.log();
  renderOverExposed(result.overExposedSecrets);

  console.log();
  console.log(`${BOLD}DUPLICATE PATTERNS${RESET}`);
  console.log(`${DIM}Secrets with similar names may be redundant or inconsistently named${RESET}`);
  console.log();
  renderDuplicates(result.duplicateGroups);

  console.log();
  console.log(`${BOLD}HYGIENE SUMMARY${RESET}`);
  console.log();
  renderSummary(result);
  console.log();
  console.log(`${DIM}${line()}${RESET}`);
  console.log();
}

async function main(): Promise<void> {
  const { workflowsPath, jsonOutput, strict } = parseArgs(process.argv);

  const result = auditWorkflows({
    workflowsDir: workflowsPath,
    overExposureThreshold: 3,
  });

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    renderPretty(result, workflowsPath);
  }

  if (strict) {
    const hasFindings =
      result.overExposedSecrets.length > 0 || result.duplicateGroups.length > 0;
    if (hasFindings) {
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
