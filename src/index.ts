import fs from 'fs';
import path from 'path';
import {
  AuditOptions,
  AuditResult,
  DuplicateGroup,
  IfConditionWarning,
  OverExposedSecret,
  SecretMap,
  SecretReference,
} from './types.js';

// Matches secrets.FOO or secrets['FOO'] only inside ${{ ... }} expressions
// The caller filters lines to ensure context is appropriate.
const SECRET_DOT_PATTERN = /secrets\.([A-Z_][A-Z0-9_]*)/g;
const SECRET_BRACKET_PATTERN = /secrets\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g;
const SECRET_DOT_PATTERN_LOWER = /secrets\.([a-z_][a-z0-9_A-Z]*)/g;
const SECRET_BRACKET_PATTERN_LOWER = /secrets\[['"]([a-z_][a-z0-9_A-Z]*)['"]\]/g;

function globWorkflowFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith('.yml') || e.name.endsWith('.yaml')))
    .map((e) => path.join(dir, e.name));
}

/**
 * Extract secret names from a string segment that has already been confirmed
 * to be within an expression context (e.g. inside ${{ ... }} or an env: block value).
 */
function extractSecretsFromSegment(segment: string): string[] {
  const found: string[] = [];
  const patterns = [
    SECRET_DOT_PATTERN,
    SECRET_BRACKET_PATTERN,
    SECRET_DOT_PATTERN_LOWER,
    SECRET_BRACKET_PATTERN_LOWER,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(segment)) !== null) {
      if (match[1]) {
        found.push(match[1]);
      }
    }
  }
  return [...new Set(found)];
}

/**
 * Extract all ${{ ... }} expression bodies from a line.
 */
function extractExpressionBodies(line: string): string[] {
  const bodies: string[] = [];
  const exprPattern = /\$\{\{([\s\S]*?)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = exprPattern.exec(line)) !== null) {
    bodies.push(m[1]);
  }
  return bodies;
}

/**
 * Return secret names referenced on a line, but only from valid contexts:
 *   1. Inside ${{ ... }} expressions (covers env:, with:, run:, if:, etc.)
 *   2. The right-hand side of an env-block assignment (YAML value after `KEY:`)
 *      but only when the value itself contains secrets.XXX — which will still
 *      need a ${{ }} wrapper per GHA syntax, so rule 1 covers it.
 *
 * This prevents false positives from:
 *   - Comments (# secrets.FOO)
 *   - echo/run statements that just print the name as a string
 *   - Documentation lines inside YAML
 */
function extractSecretsFromLine(line: string): string[] {
  // Skip comment lines entirely
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return [];
  }

  const secrets: string[] = [];

  // Only collect secrets found inside ${{ }} expression bodies
  for (const body of extractExpressionBodies(line)) {
    secrets.push(...extractSecretsFromSegment(body));
  }

  return [...new Set(secrets)];
}

interface ParseResult {
  secretMap: SecretMap;
  ifConditionWarnings: IfConditionWarning[];
}

function parseWorkflowFile(filePath: string): ParseResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const secretMap: SecretMap = {};
  const ifConditionWarnings: IfConditionWarning[] = [];

  let currentJob = 'unknown';
  let currentStep = 'unknown';
  let stepIndex = 0;

  // Track whether we are inside the top-level `jobs:` block.
  // A line at indent-0 that is NOT `jobs:` resets back to a different top-level key.
  let insideJobsBlock = false;

  // A job-ID line is exactly 2-space indent followed by an identifier and colon,
  // with no other content — and we must already be inside the jobs: block.
  const topLevelKeyPattern = /^([a-zA-Z0-9_-]+):\s*$/;
  const jobIdPattern = /^  ([a-zA-Z0-9_-]+):\s*$/;
  const stepNamePattern = /^\s+-?\s*name:\s*(.+)$/;
  const stepRunPattern = /^\s+-?\s*run:/;
  const stepUsesPattern = /^\s+-?\s*uses:/;
  const ifConditionPattern = /^\s+if:\s*(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Detect top-level YAML keys (zero indentation)
    const topLevelMatch = topLevelKeyPattern.exec(line);
    if (topLevelMatch) {
      insideJobsBlock = topLevelMatch[1] === 'jobs';
      // Reset job/step tracking when leaving the jobs block
      if (!insideJobsBlock) {
        currentJob = 'unknown';
        currentStep = 'unknown';
        stepIndex = 0;
      }
      continue;
    }

    // Only match job IDs when inside the jobs: block
    if (insideJobsBlock) {
      const jobMatch = jobIdPattern.exec(line);
      if (jobMatch) {
        currentJob = jobMatch[1];
        stepIndex = 0;
        currentStep = 'unknown';
      }
    }

    const stepNameMatch = stepNamePattern.exec(line);
    if (stepNameMatch) {
      currentStep = stepNameMatch[1].trim();
    } else if (stepRunPattern.test(line) || stepUsesPattern.test(line)) {
      stepIndex++;
      currentStep = `step-${stepIndex}`;
    }

    // Detect secrets used in if: conditions — these values appear in GitHub logs
    const ifMatch = ifConditionPattern.exec(line);
    if (ifMatch) {
      const condition = ifMatch[1].trim();
      const bodies = extractExpressionBodies(condition);
      // If no ${{ }}, the condition may still reference context directly (bare expression)
      const segmentsToCheck = bodies.length > 0 ? bodies : [condition];
      for (const seg of segmentsToCheck) {
        const secretsInCond = extractSecretsFromSegment(seg);
        for (const name of secretsInCond) {
          ifConditionWarnings.push({
            secretName: name,
            file: filePath,
            job: currentJob,
            line: lineNumber,
            condition,
          });
        }
      }
    }

    const secrets = extractSecretsFromLine(line);
    for (const secretName of secrets) {
      const ref: SecretReference = {
        file: filePath,
        job: currentJob,
        step: currentStep,
        line: lineNumber,
      };

      if (!secretMap[secretName]) {
        secretMap[secretName] = {
          name: secretName,
          references: [],
          isGithubToken: secretName.toUpperCase() === 'GITHUB_TOKEN',
        };
      }
      secretMap[secretName].references.push(ref);
    }
  }

  return { secretMap, ifConditionWarnings };
}

function mergeSecretMaps(maps: SecretMap[]): SecretMap {
  const merged: SecretMap = {};
  for (const map of maps) {
    for (const [name, usage] of Object.entries(map)) {
      if (!merged[name]) {
        merged[name] = { name, references: [], isGithubToken: usage.isGithubToken };
      }
      merged[name].references.push(...usage.references);
    }
  }
  return merged;
}

function detectOverExposedSecrets(
  secretMap: SecretMap,
  threshold: number
): OverExposedSecret[] {
  const overExposed: OverExposedSecret[] = [];

  for (const [name, usage] of Object.entries(secretMap)) {
    if (usage.isGithubToken) continue;

    const uniqueJobs = new Set(usage.references.map((r) => `${r.file}::${r.job}`));
    const uniqueFiles = new Set(usage.references.map((r) => r.file));

    if (uniqueJobs.size >= threshold) {
      overExposed.push({
        name,
        jobCount: uniqueJobs.size,
        fileCount: uniqueFiles.size,
        references: usage.references,
        recommendation: `Secret "${name}" is referenced in ${uniqueJobs.size} jobs across ${uniqueFiles.size} workflow(s). Consider scoping it to only the jobs that require it, or splitting into more specific secrets per integration.`,
      });
    }
  }

  return overExposed.sort((a, b) => b.jobCount - a.jobCount);
}

function stripSuffix(name: string, suffixes: string[]): string {
  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length);
    }
  }
  return name;
}

function detectDuplicateGroups(secretMap: SecretMap): DuplicateGroup[] {
  const names = Object.keys(secretMap).filter(
    (n) => !secretMap[n].isGithubToken
  );

  const COMMON_SUFFIXES = ['_KEY', '_SECRET', '_TOKEN', '_ID', '_URL', '_HOST', '_PASSWORD', '_PASS'];
  const groups: DuplicateGroup[] = [];
  const grouped = new Set<string>();

  // Group by normalized base name (strip common suffixes)
  const baseGroups: Record<string, string[]> = {};
  for (const name of names) {
    const upper = name.toUpperCase();
    const base = stripSuffix(upper, COMMON_SUFFIXES);
    if (!baseGroups[base]) baseGroups[base] = [];
    baseGroups[base].push(name);
  }

  for (const [base, members] of Object.entries(baseGroups)) {
    if (members.length > 1 && !members.every((m) => grouped.has(m))) {
      groups.push({
        names: members,
        reason: `These secrets share the base name "${base}" and may represent the same credential under different naming conventions, or could be consolidated.`,
      });
      for (const m of members) grouped.add(m);
    }
  }

  // Also detect near-duplicates by prefix matching for short names
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i].toUpperCase();
      const b = names[j].toUpperCase();
      if (grouped.has(names[i]) && grouped.has(names[j])) continue;

      const longer = a.length > b.length ? a : b;
      const shorter = a.length <= b.length ? a : b;

      if (longer.length > 5 && longer.startsWith(shorter) && longer.length - shorter.length <= 4) {
        groups.push({
          names: [names[i], names[j]],
          reason: `"${names[i]}" and "${names[j]}" appear to be near-duplicates based on name prefix similarity.`,
        });
        grouped.add(names[i]);
        grouped.add(names[j]);
      }
    }
  }

  return groups;
}

export function auditWorkflows(options: AuditOptions): AuditResult {
  const files = globWorkflowFiles(options.workflowsDir);
  const threshold = options.overExposureThreshold;
  const excludeSet = new Set(
    (options.excludeSecrets ?? []).map((s) => s.toUpperCase())
  );

  if (files.length === 0) {
    return {
      workflowsScanned: 0,
      workflowFiles: [],
      secretMap: {},
      overExposedSecrets: [],
      duplicateGroups: [],
      githubTokenUsages: [],
      ifConditionWarnings: [],
      totalUniqueSecrets: 0,
      totalReferences: 0,
      summary: {
        workflowsScanned: 0,
        uniqueSecrets: 0,
        overExposedCount: 0,
        duplicateGroupCount: 0,
        githubTokenCount: 0,
        ifConditionWarningCount: 0,
        recommendations: ['No workflow files found. Ensure the path points to a .github/workflows directory.'],
      },
    };
  }

  const perFileResults = files.map((f) => parseWorkflowFile(f));
  const perFileMaps = perFileResults.map((r) => r.secretMap);
  const allIfWarnings = perFileResults.flatMap((r) => r.ifConditionWarnings);

  let secretMap = mergeSecretMaps(perFileMaps);

  // Apply exclusions
  if (excludeSet.size > 0) {
    for (const key of Object.keys(secretMap)) {
      if (excludeSet.has(key.toUpperCase())) {
        delete secretMap[key];
      }
    }
  }

  const overExposedSecrets = detectOverExposedSecrets(secretMap, threshold);
  const duplicateGroups = detectDuplicateGroups(secretMap);

  const githubTokenUsages = Object.values(secretMap)
    .filter((u) => u.isGithubToken)
    .flatMap((u) => u.references);

  // Filter if-condition warnings to excluded secrets
  const ifConditionWarnings = allIfWarnings.filter(
    (w) => !excludeSet.has(w.secretName.toUpperCase())
  );

  const totalReferences = Object.values(secretMap).reduce(
    (sum, u) => sum + u.references.length,
    0
  );

  const recommendations: string[] = [];

  if (overExposedSecrets.length > 0) {
    recommendations.push(
      `Review ${overExposedSecrets.length} over-exposed secret(s) and restrict their scope to only the jobs that require them.`
    );
  }

  if (duplicateGroups.length > 0) {
    recommendations.push(
      `Investigate ${duplicateGroups.length} potential duplicate secret group(s) to reduce credential sprawl.`
    );
  }

  if (ifConditionWarnings.length > 0) {
    recommendations.push(
      `${ifConditionWarnings.length} secret(s) used in "if:" conditions — these values may be exposed in GitHub Actions logs.`
    );
  }

  if (githubTokenUsages.length === 0) {
    recommendations.push(
      'No GITHUB_TOKEN usage detected. If your workflows interact with the GitHub API, consider whether GITHUB_TOKEN is appropriate instead of a PAT.'
    );
  }

  if (Object.keys(secretMap).length === 0) {
    recommendations.push('No secret references found in any workflow. Verify workflows are using secrets correctly.');
  }

  if (recommendations.length === 0) {
    recommendations.push('No hygiene issues detected. Secret usage looks clean.');
  }

  return {
    workflowsScanned: files.length,
    workflowFiles: files,
    secretMap,
    overExposedSecrets,
    duplicateGroups,
    githubTokenUsages,
    ifConditionWarnings,
    totalUniqueSecrets: Object.keys(secretMap).length,
    totalReferences,
    summary: {
      workflowsScanned: files.length,
      uniqueSecrets: Object.keys(secretMap).length,
      overExposedCount: overExposedSecrets.length,
      duplicateGroupCount: duplicateGroups.length,
      githubTokenCount: githubTokenUsages.length,
      ifConditionWarningCount: ifConditionWarnings.length,
      recommendations,
    },
  };
}
