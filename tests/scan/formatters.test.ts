import { describe, expect, it } from 'vitest';

import { toJson, toMarkdown, toSarif } from '../../src/scan/index.js';
import type { CodeFinding } from '../../src/scan/index.js';

const sample: CodeFinding[] = [
  {
    file_path: 'src/api.ts',
    vulnerability: 'Missing auth',
    vulnerability_type: 'bfla',
    severity: 'high',
    reason: 'Endpoint /admin does not check role',
    line_start: 42,
    line_end: 50,
    recommendation: 'Add role guard',
    code_snippet: 'router.get("/admin", handler)',
    validator: 'bfla',
  },
  {
    file_path: 'src/api.ts',
    vulnerability: 'Debug endpoint exposed',
    vulnerability_type: 'debug-access',
    severity: 'medium',
    reason: '/__debug reachable in prod',
    line_start: 100,
    line_end: null,
    recommendation: null,
    code_snippet: null,
    validator: 'debug-access',
  },
];

describe('formatters', () => {
  it('toJson yields parseable JSON with counts and findings', () => {
    const json = toJson(sample);
    const parsed = JSON.parse(json) as {
      tool: string;
      count: number;
      counts_by_severity: Record<string, number>;
      findings: unknown[];
    };
    expect(parsed.tool).toBe('disseqt-scan');
    expect(parsed.count).toBe(2);
    expect(parsed.counts_by_severity['high']).toBe(1);
    expect(parsed.counts_by_severity['medium']).toBe(1);
    expect(parsed.findings).toHaveLength(2);
  });

  it('toMarkdown returns non-empty human text and empty-state message', () => {
    const md = toMarkdown(sample);
    expect(md).toContain('# disseqt scan');
    expect(md).toContain('src/api.ts');
    expect(md).toContain('[HIGH]');
    expect(md).toContain('[MEDIUM]');
    expect(md).toContain('_Fix:_ Add role guard');
    expect(toMarkdown([])).toContain('No findings');
  });

  it('toSarif produces valid SARIF 2.1.0 with rules and results', () => {
    const parsed = JSON.parse(toSarif(sample)) as {
      $schema: string;
      version: string;
      runs: {
        tool: { driver: { name: string; rules: { id: string }[] } };
        results: { ruleId: string; level: string; locations: unknown[] }[];
      }[];
    };
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.$schema).toContain('sarif-2.1.0');
    expect(parsed.runs).toHaveLength(1);
    const run = parsed.runs[0];
    expect(run?.tool.driver.name).toBe('disseqt-scan');
    expect(run?.tool.driver.rules.map((r) => r.id).sort()).toEqual(['bfla', 'debug-access']);
    expect(run?.results).toHaveLength(2);
    expect(run?.results[0]?.level).toBe('error'); // high -> error
    expect(run?.results[1]?.level).toBe('warning'); // medium -> warning
  });
});
