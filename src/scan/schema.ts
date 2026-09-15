// Data schema for the code scanner: findings + severity ladder.

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_ORDER: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export interface CodeFinding {
  file_path: string;
  vulnerability: string;
  vulnerability_type: string;
  severity: Severity;
  reason: string;
  line_start: number;
  line_end: number | null;
  recommendation: string | null;
  code_snippet: string | null;
  validator: string;
}

export interface CodeChunk {
  file_path: string; // POSIX-style path relative to the scan root
  language: string;
  start_line: number; // 1-indexed
  end_line: number; // inclusive
  text: string;
}

export interface ScanConfig {
  validators: string[];
  min_severity: string | null;
  max_file_bytes: number | null;
  max_chunk_chars: number | null;
  batch_chars: number | null;
  extra_skip_globs: string[];
}

export function meetsMinSeverity(sev: string, minimum: string): boolean {
  const s = SEVERITY_ORDER[sev as Severity] ?? -1;
  const m = SEVERITY_ORDER[minimum as Severity] ?? 0;
  return s >= m;
}

/** Strip fields we don't want to leak to JSON reports. */
export function findingToDict(f: CodeFinding): Record<string, unknown> {
  return {
    file_path: f.file_path,
    vulnerability: f.vulnerability,
    vulnerability_type: f.vulnerability_type,
    severity: f.severity,
    reason: f.reason,
    line_start: f.line_start,
    line_end: f.line_end,
    recommendation: f.recommendation,
    code_snippet: f.code_snippet,
    validator: f.validator,
  };
}
