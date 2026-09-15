// Render `CodeFinding` collections as markdown / SARIF / JSON.

import { SEVERITY_ORDER, findingToDict, type CodeFinding, type Severity } from './schema.js';

export const SARIF_VERSION = '2.1.0';
export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
export const TOOL_NAME = 'disseqt-scan';
export const TOOL_INFO_URI = 'https://github.com/DisseqtAI/disseqt-node-sdk';

/** SARIF only knows note < warning < error. Map our four-level severity. */
const SARIF_LEVEL: Record<Severity, 'note' | 'warning' | 'error'> = {
  low: 'note',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

/** Sort keys deep so JSON output is stable across runs. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortKeys(v);
    return out;
  }
  return value;
}

/** Machine-readable JSON: a top-level `findings` array + counts. */
export function toJson(findings: readonly CodeFinding[]): string {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  const payload = {
    tool: TOOL_NAME,
    count: findings.length,
    counts_by_severity: counts,
    findings: findings.map(findingToDict),
  };
  return JSON.stringify(sortKeys(payload), null, 2);
}

/** Human-readable summary grouped by file, sorted by severity desc. */
export function toMarkdown(findings: readonly CodeFinding[]): string {
  if (findings.length === 0) {
    return '# disseqt scan\n\nNo findings.\n';
  }

  const counts: Record<string, number> = {};
  const byFile = new Map<string, CodeFinding[]>();
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    const list = byFile.get(f.file_path);
    if (list === undefined) byFile.set(f.file_path, [f]);
    else list.push(f);
  }

  const lines: string[] = ['# disseqt scan', ''];
  lines.push(`**${findings.length} findings** across ${byFile.size} files.`);
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | --- |');
  for (const sev of ['critical', 'high', 'medium', 'low'] as const) {
    if ((counts[sev] ?? 0) > 0) lines.push(`| ${sev} | ${counts[sev]} |`);
  }
  lines.push('');

  const filePaths = [...byFile.keys()].sort();
  for (const filePath of filePaths) {
    lines.push(`## \`${filePath}\``);
    const fileFindings = [...(byFile.get(filePath) ?? [])].sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 0;
      const sb = SEVERITY_ORDER[b.severity] ?? 0;
      if (sa !== sb) return sb - sa;
      return a.line_start - b.line_start;
    });
    for (const f of fileFindings) {
      const loc =
        f.line_end === null || f.line_end === undefined
          ? `L${f.line_start}`
          : `L${f.line_start}-${f.line_end}`;
      lines.push(`- **[${f.severity.toUpperCase()}]** \`${f.vulnerability_type}\` at ${loc}`);
      lines.push(`  - ${f.reason}`);
      if (f.recommendation !== null && f.recommendation !== undefined) {
        lines.push(`  - _Fix:_ ${f.recommendation}`);
      }
      if (f.code_snippet !== null && f.code_snippet !== undefined) {
        const fence = '```';
        lines.push(`  ${fence}`);
        for (const snippetLine of f.code_snippet.split('\n')) {
          lines.push(`  ${snippetLine}`);
        }
        lines.push(`  ${fence}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').replace(/\s+$/, '') + '\n';
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  defaultConfiguration: { level: 'note' | 'warning' | 'error' };
  properties: { 'security-severity': string };
}

/** Minimal valid SARIF 2.1.0 for GitHub code-scanning upload. */
export function toSarif(findings: readonly CodeFinding[]): string {
  const rulesSeen = new Map<string, SarifRule>();
  const results: Record<string, unknown>[] = [];

  for (const f of findings) {
    const ruleId = f.vulnerability_type.length > 0 ? f.vulnerability_type : f.validator || 'unknown';
    if (!rulesSeen.has(ruleId)) {
      rulesSeen.set(ruleId, {
        id: ruleId,
        name: ruleId.replace(/-/g, '_'),
        shortDescription: { text: f.vulnerability || ruleId },
        fullDescription: { text: f.reason || f.vulnerability || ruleId },
        defaultConfiguration: { level: SARIF_LEVEL[f.severity] ?? 'warning' },
        properties: { 'security-severity': securitySeverityScore(f.severity) },
      });
    }
    const region: Record<string, unknown> = { startLine: Math.max(1, f.line_start) };
    if (f.line_end !== null && f.line_end !== undefined && f.line_end >= f.line_start) {
      region['endLine'] = f.line_end;
    }
    if (f.code_snippet !== null && f.code_snippet !== undefined) {
      region['snippet'] = { text: f.code_snippet };
    }
    const result: Record<string, unknown> = {
      ruleId,
      level: SARIF_LEVEL[f.severity] ?? 'warning',
      message: { text: f.reason || f.vulnerability || ruleId },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file_path },
            region,
          },
        },
      ],
    };
    if (f.recommendation !== null && f.recommendation !== undefined) {
      result['fixes'] = [{ description: { text: f.recommendation } }];
    }
    results.push(result);
  }

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            informationUri: TOOL_INFO_URI,
            rules: [...rulesSeen.values()],
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(sortKeys(sarif), null, 2);
}

/** GitHub uses a 0-10 numeric score. Map our buckets to sane midpoints. */
function securitySeverityScore(sev: Severity): string {
  const map: Record<Severity, string> = {
    low: '3.0',
    medium: '5.5',
    high: '7.5',
    critical: '9.5',
  };
  return map[sev] ?? '5.0';
}
