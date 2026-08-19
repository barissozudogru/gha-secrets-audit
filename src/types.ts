export interface SecretReference {
  file: string;
  job: string;
  step: string;
  line: number;
}

export interface SecretUsage {
  name: string;
  references: SecretReference[];
  isGithubToken: boolean;
}

export interface SecretMap {
  [secretName: string]: SecretUsage;
}

export interface DuplicateGroup {
  names: string[];
  reason: string;
}

export interface OverExposedSecret {
  name: string;
  jobCount: number;
  fileCount: number;
  references: SecretReference[];
  recommendation: string;
}

export interface IfConditionWarning {
  secretName: string;
  file: string;
  job: string;
  line: number;
  condition: string;
}

/**
 * A secret interpolated straight into a run: block.
 *
 * GitHub expands ${{ secrets.X }} before the shell sees it, so the value
 * becomes a literal in the command line. That exposes it to anything reading
 * the process table on the runner, to `set -x` tracing, and to any error
 * message that echoes the failing command. Passing the secret through env:
 * instead keeps it out of the command line.
 */
export interface InlineRunWarning {
  secretName: string;
  file: string;
  job: string;
  step: string;
  line: number;
}

export interface AuditSummary {
  workflowsScanned: number;
  uniqueSecrets: number;
  overExposedCount: number;
  duplicateGroupCount: number;
  githubTokenCount: number;
  ifConditionWarningCount: number;
  inlineRunWarningCount: number;
  recommendations: string[];
}

export interface AuditResult {
  workflowsScanned: number;
  workflowFiles: string[];
  secretMap: SecretMap;
  overExposedSecrets: OverExposedSecret[];
  duplicateGroups: DuplicateGroup[];
  githubTokenUsages: SecretReference[];
  ifConditionWarnings: IfConditionWarning[];
  inlineRunWarnings: InlineRunWarning[];
  totalUniqueSecrets: number;
  totalReferences: number;
  summary: AuditSummary;
}

export interface AuditOptions {
  workflowsDir: string;
  overExposureThreshold: number;
  excludeSecrets?: string[];
}
