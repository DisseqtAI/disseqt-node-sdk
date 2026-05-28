#!/usr/bin/env node
// Disseqt Node SDK introspection.
//
// Modes:
//   list                                  — every validator domain + slug
//   show <domain-slug> <validator-slug>   — full detail for one validator
//   tracing                               — agentic tracing API surface
//   models                                — request model field tables
//
// Source lookup order:
//   1. $DISSEQT_SDK_ROOT (treat as the package root; we'll try src/ then dist/)
//   2. ./src and ./dist relative to cwd (running inside disseqt-node-sdk repo)
//   3. ./node_modules/@disseqt/ai-sdk/dist (consumer project)
//
// The script reads either the TypeScript source (preferred — has comments and
// init interfaces) or the bundled .d.ts (works for installed packages). It does
// not import the SDK, so it has no runtime deps beyond Node 18+.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const HELP = `Usage:
  introspect.mjs list
  introspect.mjs show <domain> <slug>
  introspect.mjs tracing
  introspect.mjs models

Examples:
  introspect.mjs list
  introspect.mjs show input-validation toxicity
  introspect.mjs show output-validation grammatical-correctness
  introspect.mjs show composite evaluate

Set DISSEQT_SDK_ROOT to the package root if the script cannot auto-locate the SDK.`;

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function locateSdk() {
  const candidates = [];
  if (process.env.DISSEQT_SDK_ROOT) candidates.push(process.env.DISSEQT_SDK_ROOT);
  candidates.push(process.cwd());
  candidates.push(join(process.cwd(), 'node_modules', '@disseqt', 'ai-sdk'));

  for (const root of candidates) {
    const srcEnum = join(root, 'src', 'validation', 'enums.ts');
    if (existsSync(srcEnum)) {
      return { root, mode: 'src' };
    }
    const distEnum = join(root, 'dist', 'validation', 'index.d.ts');
    if (existsSync(distEnum)) {
      return { root, mode: 'dist' };
    }
  }

  fail(
    'could not find Disseqt SDK. Set DISSEQT_SDK_ROOT, or cd into the disseqt-node-sdk repo / a project that depends on @disseqt/ai-sdk.',
  );
}

function readValidationSources(sdk) {
  if (sdk.mode === 'src') {
    return {
      enums: readFileSync(join(sdk.root, 'src', 'validation', 'enums.ts'), 'utf8'),
      helpers: readFileSync(join(sdk.root, 'src', 'validation', 'helpers.ts'), 'utf8'),
      models: readFileSync(join(sdk.root, 'src', 'validation', 'models.ts'), 'utf8'),
    };
  }
  // dist mode: the bundler concatenates everything into validation/index.d.ts
  const merged = readFileSync(join(sdk.root, 'dist', 'validation', 'index.d.ts'), 'utf8');
  return { enums: merged, helpers: merged, models: merged };
}

function readAgenticSources(sdk) {
  if (sdk.mode === 'src') {
    return {
      helpers: readFileSync(join(sdk.root, 'src', 'agentic', 'helpers.ts'), 'utf8'),
      client: readFileSync(join(sdk.root, 'src', 'agentic', 'client.ts'), 'utf8'),
      enums: readFileSync(join(sdk.root, 'src', 'agentic', 'enums.ts'), 'utf8'),
    };
  }
  const merged = readFileSync(join(sdk.root, 'dist', 'agentic', 'index.d.ts'), 'utf8');
  return { helpers: merged, client: merged, enums: merged };
}

// --- Enum parsing -----------------------------------------------------------

// Matches both:
//   export enum InputValidation { Toxicity = 'toxicity', ... }
//   declare enum InputValidation { Toxicity = "toxicity", ... }
function parseEnum(source, name) {
  const re = new RegExp(`(?:export|declare)\\s+enum\\s+${name}\\s*\\{([^}]*)\\}`, 'm');
  const match = source.match(re);
  if (!match) return [];
  const body = match[1];
  const entryRe = /(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  const entries = [];
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    entries.push({ name: m[1], slug: m[2] });
  }
  return entries;
}

// --- Helper class parsing ---------------------------------------------------

// We extract method names from a helper class so we can map slug -> method.
// Pattern matches both `methodName(data, config): Promise<...>` (src) and
// `methodName(data: X, config: Y): Promise<...>` (declared in d.ts).
function parseHelperMethods(source, className) {
  // Capture the class block.
  const classRe = new RegExp(`(?:export\\s+)?(?:declare\\s+)?class\\s+${className}[^\\{]*\\{([\\s\\S]*?)^\\}`, 'm');
  const match = source.match(classRe);
  if (!match) return [];
  const body = match[1];
  const methodRe = /^\s*(?!constructor|private|protected|static|readonly)([a-z]\w*)\s*\(/gm;
  const names = new Set();
  let m;
  while ((m = methodRe.exec(body)) !== null) {
    if (m[1] !== 'run') names.add(m[1]);
  }
  return [...names];
}

function slugToCamel(slug) {
  return slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// --- Domain catalog ---------------------------------------------------------

const DOMAINS = [
  {
    domain: 'input-validation',
    enumName: 'InputValidation',
    helperClass: 'InputValidationHelpers',
    clientField: 'input',
    requestModel: 'InputValidationRequest',
    requestInit: 'InputValidationRequestInit',
    requiresConfig: true,
    helperFields: [
      { name: 'prompt', type: 'string', required: true, note: 'The user-supplied text to evaluate' },
      { name: 'context', type: 'string | null', required: false },
      { name: 'response', type: 'string | null', required: false },
    ],
  },
  {
    domain: 'output-validation',
    enumName: 'OutputValidation',
    helperClass: 'OutputValidationHelpers',
    clientField: 'output',
    requestModel: 'OutputValidationRequest',
    requestInit: 'LlmTextFieldsInit',
    requiresConfig: true,
    helperFields: [
      { name: 'prompt', type: 'string | null', required: false, note: 'Original user prompt (llm_input_query on the wire)' },
      { name: 'context', type: 'string | null', required: false, note: 'RAG / system context (llm_input_context)' },
      { name: 'response', type: 'string | null', required: false, note: 'The model output to evaluate (llm_output)' },
    ],
  },
  {
    domain: 'rag-grounding',
    enumName: 'RagGrounding',
    helperClass: 'RagGroundingHelpers',
    clientField: 'rag',
    requestModel: 'RagGroundingRequest',
    requestInit: 'LlmTextFieldsInit',
    requiresConfig: true,
    helperFields: [
      { name: 'prompt', type: 'string | null', required: false },
      { name: 'context', type: 'string | null', required: false, note: 'Required for most RAG validators — the retrieved context' },
      { name: 'response', type: 'string | null', required: false },
    ],
  },
  {
    domain: 'agentic-behavior',
    enumName: 'AgenticBehavior',
    helperClass: 'AgenticBehaviorHelpers',
    clientField: 'agentic',
    requestModel: 'AgenticBehaviourRequest',
    requestInit: 'AgenticBehaviourRequestInit',
    requiresConfig: true,
    helperFields: [
      { name: 'conversationHistory', type: 'string[] | null', required: false, note: 'Lines like "User: ..." / "Agent: ..."' },
      { name: 'toolCalls', type: 'Record<string, unknown>[] | null', required: false, note: 'Each entry typically has name/arguments/result' },
      { name: 'agentResponses', type: 'string[] | null', required: false },
      { name: 'referenceData', type: 'Record<string, unknown> | null', required: false, note: 'Ground-truth, expected goal, etc.' },
    ],
  },
  {
    domain: 'mcp-security',
    enumName: 'McpSecurity',
    helperClass: 'McpSecurityHelpers',
    clientField: 'mcp',
    requestModel: 'McpSecurityRequest',
    requestInit: 'LlmTextFieldsInit',
    requiresConfig: true,
    helperFields: [
      { name: 'prompt', type: 'string | null', required: false, note: 'MCP tool/resource invocation to check' },
      { name: 'context', type: 'string | null', required: false },
      { name: 'response', type: 'string | null', required: false },
    ],
  },
  {
    domain: 'themes-classifier',
    enumName: 'ThemesClassifier',
    helperClass: 'ThemesClassifierHelpers',
    clientField: 'themes',
    requestModel: 'ThemesClassifierRequest',
    requestInit: 'ThemesClassifierRequestInit',
    requiresConfig: false,
    unsupported: 'Server currently returns HTTP 500 "No validator results returned" for this endpoint. SDK shape is correct (verified against payload spec) — wait for server-side fix before relying on it.',
    helperFields: [
      { name: 'text', type: 'string', required: true },
      { name: 'returnSubthemes', type: 'boolean', required: false, default: 'true' },
      { name: 'maxThemes', type: 'number', required: false, default: '3' },
    ],
  },
  {
    domain: 'composite',
    enumName: 'Composite',
    helperClass: 'CompositeHelpers',
    clientField: 'composite',
    requestModel: 'CompositeScoreRequest',
    requestInit: 'CompositeScoreRequestInit',
    requiresConfig: false,
    note: 'Hits a different endpoint than the per-validator route (/api/v1/validators/composite/evaluate, no /sdk/ prefix). Payload uses { input_data, options } instead of { input_data, config_input }.',
    helperFields: [
      { name: 'llmInputQuery', type: 'string', required: true },
      { name: 'llmOutput', type: 'string', required: true },
      { name: 'llmInputContext', type: 'string | null', required: false },
      { name: 'evaluationMode', type: "'binary_threshold' | string", required: false, default: "'binary_threshold'" },
      { name: 'weightsOverride', type: 'Record<string, unknown> | null', required: false, note: 'Per-metric and per-submetric weights' },
      { name: 'labelsThresholdsOverride', type: 'Record<string, unknown> | null', required: false },
      { name: 'overallConfidence', type: 'Record<string, unknown> | null', required: false },
    ],
  },
];

function buildCatalog(sdk) {
  const { enums, helpers } = readValidationSources(sdk);
  return DOMAINS.map((d) => ({
    ...d,
    members: parseEnum(enums, d.enumName),
    methods: parseHelperMethods(helpers, d.helperClass),
  }));
}

// --- Output renderers -------------------------------------------------------

function renderList(catalog) {
  let out = '# Validator catalog\n\n';
  let total = 0;
  for (const d of catalog) {
    out += `## ${d.domain} (${d.members.length}${d.unsupported ? ', UNSUPPORTED' : ''})\n`;
    if (d.unsupported) out += `> ⚠️ ${d.unsupported}\n`;
    if (d.note) out += `> ℹ️ ${d.note}\n`;
    out += `Client field: \`client.${d.clientField}\`\n\n`;
    for (const m of d.members) {
      const method = pickMethod(d.methods, m.slug);
      out += `- \`${m.slug}\``;
      if (method) out += `  →  \`client.${d.clientField}.${method}(data, ${d.requiresConfig ? 'config' : ''})\``;
      out += '\n';
      total += 1;
    }
    out += '\n';
  }
  out += `Total: ${total} validator slugs (themes-classifier counted but currently broken server-side).\n`;
  return out;
}

function pickMethod(methods, slug) {
  const camel = slugToCamel(slug);
  if (methods.includes(camel)) return camel;
  // Special case: grammatical-correctness → grammarCorrectness (helper trims "correctness" prefix oddly)
  const aliases = { 'grammatical-correctness': 'grammarCorrectness' };
  if (aliases[slug] && methods.includes(aliases[slug])) return aliases[slug];
  return null;
}

function renderShow(catalog, domain, slug) {
  const d = catalog.find((x) => x.domain === domain);
  if (!d) {
    return `Unknown domain "${domain}". Known: ${catalog.map((c) => c.domain).join(', ')}\n`;
  }
  const member = d.members.find((m) => m.slug === slug);
  if (!member) {
    return `Domain "${domain}" has no slug "${slug}". Available: ${d.members.map((m) => m.slug).join(', ')}\n`;
  }
  const method = pickMethod(d.methods, slug) ?? `run(${d.enumName}.${member.name}, ...)`;
  const fieldsTable = d.helperFields
    .map((f) => `  ${f.name}${f.required ? '' : '?'}: ${f.type}${f.default ? ` = ${f.default}` : ''}${f.note ? `   // ${f.note}` : ''}`)
    .join('\n');
  const exampleData = buildExampleData(d.helperFields);
  const exampleConfig = d.requiresConfig
    ? `,\n  { threshold: 0.5, customLabels: ['Safe', 'Risk'], labelThresholds: [0.5] }`
    : '';
  const callLine = method.startsWith('run')
    ? `await client.${d.clientField}.${method}(\n  ${exampleData}${exampleConfig},\n);`
    : `await client.${d.clientField}.${method}(\n  ${exampleData}${exampleConfig},\n);`;

  let out = `# ${domain} / ${slug}\n\n`;
  if (d.unsupported) out += `> ⚠️ ${d.unsupported}\n\n`;
  if (d.note) out += `> ℹ️ ${d.note}\n\n`;
  out += `**Helper**: \`client.${d.clientField}.${method}()\`\n`;
  out += `**Enum**: \`${d.enumName}.${member.name}\` (= \`'${member.slug}'\`)\n`;
  out += `**Request model**: \`${d.requestModel}\`\n`;
  out += `**Config required**: ${d.requiresConfig ? 'yes (`{ threshold, customLabels?, labelThresholds? }`)' : 'no'}\n\n`;
  out += `## Data fields\n\n\`\`\`ts\n{\n${fieldsTable}\n}\n\`\`\`\n\n`;
  out += `## Example\n\n\`\`\`ts\nimport { Client } from '@disseqt/ai-sdk';\n\nconst client = new Client({\n  apiKey: process.env.DISSEQT_API_KEY!,\n  projectId: process.env.DISSEQT_PROJECT_ID!,\n});\n\n${callLine}\n\`\`\`\n\n`;
  out += `## Wire payload\n\nServer receives:\n\n\`\`\`json\n${JSON.stringify(buildExamplePayload(d, member), null, 2)}\n\`\`\`\n`;
  return out;
}

function buildExampleData(fields) {
  const lines = ['{'];
  for (const f of fields) {
    if (f.name === 'prompt') lines.push(`    prompt: 'example user prompt to evaluate',`);
    else if (f.name === 'context') lines.push(`    context: 'retrieved context here',`);
    else if (f.name === 'response') lines.push(`    response: 'model output to evaluate',`);
    else if (f.name === 'text') lines.push(`    text: 'text to classify',`);
    else if (f.name === 'conversationHistory') lines.push(`    conversationHistory: ['User: hi', 'Agent: hello'],`);
    else if (f.name === 'toolCalls') lines.push(`    toolCalls: [{ name: 'search', arguments: { q: 'x' }, result: 'y' }],`);
    else if (f.name === 'agentResponses') lines.push(`    agentResponses: ['hello'],`);
    else if (f.name === 'referenceData') lines.push(`    referenceData: { expectedGoal: 'greet user' },`);
    else if (f.name === 'returnSubthemes') lines.push(`    returnSubthemes: true,`);
    else if (f.name === 'maxThemes') lines.push(`    maxThemes: 3,`);
    else if (f.name === 'llmInputQuery') lines.push(`    llmInputQuery: 'What is the capital of France?',`);
    else if (f.name === 'llmOutput') lines.push(`    llmOutput: 'The capital of France is Paris.',`);
    else if (f.name === 'llmInputContext') lines.push(`    llmInputContext: 'France is a country in Europe.',`);
    else if (f.name === 'evaluationMode') lines.push(`    evaluationMode: 'binary_threshold',`);
  }
  lines.push('  }');
  return lines.join('\n  ');
}

function buildExamplePayload(d, member) {
  if (d.domain === 'composite') {
    return {
      input_data: { llm_input_query: 'What is the capital of France?', llm_output: 'Paris.' },
      options: { evaluation_mode: 'binary_threshold' },
    };
  }
  if (d.domain === 'themes-classifier') {
    return { input_data: { text: 'text to classify', return_subthemes: true, max_themes: 3 } };
  }
  const innerInput = {};
  for (const f of d.helperFields) {
    if (f.name === 'prompt') innerInput.llm_input_query = 'example user prompt to evaluate';
    if (f.name === 'context') innerInput.llm_input_context = 'retrieved context here';
    if (f.name === 'response') innerInput.llm_output = 'model output to evaluate';
    if (f.name === 'conversationHistory') innerInput.conversation_history = ['User: hi', 'Agent: hello'];
    if (f.name === 'toolCalls') innerInput.tool_calls = [{ name: 'search', arguments: { q: 'x' }, result: 'y' }];
    if (f.name === 'agentResponses') innerInput.agent_responses = ['hello'];
    if (f.name === 'referenceData') innerInput.reference_data = { expected_goal: 'greet user' };
  }
  return {
    input_data: innerInput,
    config_input: { threshold: 0.5, custom_labels: ['Safe', 'Risk'], label_thresholds: [0.5] },
  };
}

function renderTracing(sdk) {
  const { helpers, client } = readAgenticSources(sdk);
  const exports = new Set();
  const exportRe = /^export\s+(?:async\s+)?function\s+(\w+)/gm;
  let m;
  while ((m = exportRe.exec(helpers)) !== null) exports.add(m[1]);
  // Don't list snake_case aliases — they duplicate camelCase.
  const camel = [...exports].filter((n) => !n.includes('_'));

  const out = [];
  out.push('# Agentic Tracing API\n');
  out.push('## Client');
  out.push('```ts');
  out.push("import { DisseqtAgenticClient } from '@disseqt/ai-sdk';");
  out.push('');
  out.push('const client = new DisseqtAgenticClient({');
  out.push('  apiKey: process.env.DISSEQT_API_KEY!,');
  out.push('  projectId: process.env.DISSEQT_PROJECT_ID!,');
  out.push("  serviceName: 'my-assistant',");
  out.push("  environment: 'production', // optional, defaults to 'production'");
  out.push('  // maxBatchSize: 100,         // optional buffer settings');
  out.push('  // flushIntervalMs: 1000,');
  out.push('  // maxRetries: 3,');
  out.push('});');
  out.push('```');
  out.push('');
  out.push('Buffered: spans collect in memory and flush on `flushIntervalMs` or when the buffer hits `maxBatchSize`. **Always `await client.flush()` and `await client.shutdown()` before exit** — otherwise pending spans are lost.');
  out.push('');
  out.push('## Top-level helpers');
  out.push('');
  for (const name of camel.sort()) {
    out.push(`- \`${name}\``);
  }
  out.push('');
  out.push('## Typical usage');
  out.push('```ts');
  out.push("import { DisseqtAgenticClient, SpanKind, startTrace, traceLlmCall, traceToolCall } from '@disseqt/ai-sdk';");
  out.push('');
  out.push('const client = new DisseqtAgenticClient({ /* ...as above... */ });');
  out.push('');
  out.push("await startTrace(client, 'agent_workflow', { intentId: 'intent-1' }).run(async (trace) => {");
  out.push("  const agent = trace.startSpan('agent_execution', SpanKind.AgentExec);");
  out.push("  agent.setAgentInfo('assistant', 'agent-001');");
  out.push('');
  out.push('  const llm = traceLlmCall(trace, {');
  out.push("    name: 'chat_completion',");
  out.push("    modelName: 'gpt-4',");
  out.push("    provider: 'openai',");
  out.push("    inputMessages: [{ role: 'user', content: 'Hello' }],");
  out.push("    outputMessages: [{ role: 'assistant', content: 'Hi' }],");
  out.push('    inputTokens: 10,');
  out.push('    outputTokens: 5,');
  out.push('  });');
  out.push('  llm.close();');
  out.push('');
  out.push('  const tool = traceToolCall(trace, {');
  out.push("    name: 'weather_api',");
  out.push("    toolName: 'get_weather',");
  out.push("    callId: 'call-001',");
  out.push('  });');
  out.push('  tool.close();');
  out.push('');
  out.push('  agent.close();');
  out.push('});');
  out.push('');
  out.push('await client.flush();');
  out.push('await client.shutdown();');
  out.push('```');
  out.push('');
  out.push('`startTrace(...).run(callback)` is the safest pattern — it ends the trace and sends it to the buffer when `callback` resolves (or throws). If you build a trace by hand, call `traceWrapper.close()` yourself.');
  out.push('');
  out.push('## SpanKind values');
  out.push('');
  const enumMatch = (sdk.mode === 'src'
    ? readFileSync(join(sdk.root, 'src', 'agentic', 'enums.ts'), 'utf8')
    : client
  );
  const kinds = parseEnum(enumMatch, 'SpanKind');
  for (const k of kinds) {
    out.push(`- \`SpanKind.${k.name}\` (= \`'${k.slug}'\`)`);
  }
  out.push('');
  out.push('## Decorator-style: `traceFunction`');
  out.push('```ts');
  out.push("import { traceFunction, SpanKind } from '@disseqt/ai-sdk';");
  out.push('');
  out.push('const tracedHandler = traceFunction(client, async (userInput: string) => {');
  out.push('  // ... do work ...');
  out.push("  return 'response';");
  out.push("}, { name: 'handle_request', kind: SpanKind.AgentExec });");
  out.push('');
  out.push("await tracedHandler('hello');");
  out.push('```');
  out.push('');
  out.push('Each call opens its own trace, runs your function inside a span, and auto-closes — handy for wrapping existing handlers without manual span bookkeeping.');
  return out.join('\n') + '\n';
}

function renderModels() {
  return `# Request models — quick reference

| Model | Fields | Notes |
|---|---|---|
| \`InputValidationRequest\` | \`prompt\` (req), \`context\`, \`response\` | LLM input only; mapped to \`llm_input_query\` |
| \`OutputValidationRequest\` | \`prompt\`, \`context\`, \`response\` | At minimum supply \`response\`; some validators also need \`prompt\` and/or \`context\` |
| \`RagGroundingRequest\` | \`prompt\`, \`context\`, \`response\` | \`context\` is the retrieved chunk(s); most RAG validators are useless without it |
| \`AgenticBehaviourRequest\` | \`conversationHistory\`, \`toolCalls\`, \`agentResponses\`, \`referenceData\` | Pass arrays/objects; SDK serialises with snake_case keys |
| \`McpSecurityRequest\` | \`prompt\`, \`context\`, \`response\` | Same shape as OutputValidationRequest |
| \`ThemesClassifierRequest\` | \`text\` (req), \`returnSubthemes\` (default true), \`maxThemes\` (default 3) | ⚠️ server endpoint currently broken |
| \`CompositeScoreRequest\` | \`llmInputQuery\` (req), \`llmOutput\` (req), \`llmInputContext\`, \`evaluationMode\`, \`weightsOverride\`, \`labelsThresholdsOverride\`, \`overallConfidence\` | Hits \`/api/v1/validators/composite/evaluate\` (no \`/sdk/\` prefix) |

## SDKConfigInput (every domain except themes and composite)

\`\`\`ts
{
  threshold: number,              // required
  customLabels?: string[],        // optional, e.g. ['Safe', 'Moderate Risk', 'High Risk']
  labelThresholds?: number[],     // optional, must have customLabels.length - 1 entries
}
\`\`\`

Both camelCase and snake_case keys are accepted on every model and config — porting from Python keeps working.
`;
}

// --- Main -------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  console.log(HELP);
  process.exit(0);
}

const sdk = locateSdk();
process.stderr.write(`# resolved SDK at ${sdk.root} (${sdk.mode} mode)\n`);

const [mode, ...rest] = args;
let output;
switch (mode) {
  case 'list': {
    output = renderList(buildCatalog(sdk));
    break;
  }
  case 'show': {
    if (rest.length !== 2) fail('usage: introspect.mjs show <domain> <slug>');
    output = renderShow(buildCatalog(sdk), rest[0], rest[1]);
    break;
  }
  case 'tracing': {
    output = renderTracing(sdk);
    break;
  }
  case 'models': {
    output = renderModels();
    break;
  }
  default:
    fail(`unknown mode "${mode}"\n\n${HELP}`);
}
process.stdout.write(output);
