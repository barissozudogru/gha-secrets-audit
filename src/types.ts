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

export interface AuditSummary {
  workflowsScanned: number;
  uniqueSecrets: number;
  overExposedCount: number;
  duplicateGroupCount: number;
  githubTokenCount: number;
  ifConditionWarningCount: number;
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
  totalUniqueSecrets: number;
  totalReferences: number;
  summary: AuditSummary;
}

export interface AuditOptions {
  workflowsDir: string;
  overExposureThreshold: number;
  excludeSecrets?: string[];
}
