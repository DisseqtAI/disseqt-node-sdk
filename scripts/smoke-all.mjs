#!/usr/bin/env node
import process from 'node:process';

import {
  AgenticBehavior,
  Client,
  Composite,
  DisseqtAgenticClient,
  InputValidation,
  McpSecurity,
  OutputValidation,
  RagGrounding,
  SpanKind,
  ThemesClassifier,
  ValidatorDomain,
  startTrace,
} from '../dist/index.js';

const isLive = process.argv.includes('--live') || process.env.DISSEQT_LIVE === '1';
const summary = {
  passed: 0,
  failed: 0,
};

const validationBaseUrl = process.env.DISSEQT_VALIDATION_BASE_URL;
const agenticEndpoint = process.env.DISSEQT_AGENTIC_ENDPOINT;
const FetchResponse = globalThis.Response;

function writeLine(message) {
  process.stdout.write(`${message}\n`);
}

function pass(name) {
  summary.passed += 1;
  writeLine(`[PASS] ${name}`);
}

function fail(name, error) {
  summary.failed += 1;
  writeLine(`[FAIL] ${name} | ${formatError(error)}`);
}

function info(message) {
  writeLine(`[INFO] ${message}`);
}

function formatError(error) {
  if (error instanceof Error) {
    const details = [
      error.message,
      'statusCode' in error ? `status=${String(error.statusCode)}` : '',
      'responseBody' in error && error.responseBody ? `body=${String(error.responseBody)}` : '',
    ].filter(Boolean);
    return details.join(' | ').replaceAll(/\s+/g, ' ').slice(0, 500);
  }
  return String(error).replaceAll(/\s+/g, ' ').slice(0, 500);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required for live smoke tests`);
  }
  return value;
}

function enumValues(enumObject) {
  return Object.values(enumObject);
}

function makeMockFetch(calls) {
  return async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });

    if (url.includes('/agentic-monitoring/') || url.endsWith('/traces')) {
      return new FetchResponse(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new FetchResponse(
      JSON.stringify({
        data: {
          metric_name: url.split('/').at(-1),
          actual_value: 0.1,
          passed: true,
        },
        status: { code: '200' },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };
}

function standardValidationData(domain) {
  if (domain === ValidatorDomain.AgenticBehavior) {
    return {
      conversation_history: [
        'user: Find relevant information about Paris.',
        'agent: I searched the knowledge base and summarized the answer.',
      ],
      tool_calls: [{ name: 'search', input: { query: 'Paris capital' }, output: 'Paris' }],
      agent_responses: ['Paris is the capital of France.'],
      reference_data: {
        expected_topics: ['France', 'Paris', 'capital city'],
        expected_tools: ['search'],
      },
    };
  }

  return {
    llm_input_query: 'What is the capital of France?',
    llm_input_context: 'France is a country in Europe. Paris is its capital city.',
    llm_output: 'The capital of France is Paris.',
  };
}

function validationCases() {
  const cases = [];

  for (const slug of enumValues(InputValidation)) {
    cases.push({
      name: `validator ${ValidatorDomain.InputValidation}/${slug}`,
      request: {
        domain: ValidatorDomain.InputValidation,
        slug,
        data: standardValidationData(ValidatorDomain.InputValidation),
        config: { threshold: 0.5 },
      },
    });
  }

  for (const slug of enumValues(OutputValidation)) {
    cases.push({
      name: `validator ${ValidatorDomain.OutputValidation}/${slug}`,
      request: {
        domain: ValidatorDomain.OutputValidation,
        slug,
        data: standardValidationData(ValidatorDomain.OutputValidation),
        config: { threshold: 0.5 },
      },
    });
  }

  for (const slug of enumValues(RagGrounding)) {
    cases.push({
      name: `validator ${ValidatorDomain.RagGrounding}/${slug}`,
      request: {
        domain: ValidatorDomain.RagGrounding,
        slug,
        data: standardValidationData(ValidatorDomain.RagGrounding),
        config: { threshold: 0.5 },
      },
    });
  }

  for (const slug of enumValues(AgenticBehavior)) {
    cases.push({
      name: `validator ${ValidatorDomain.AgenticBehavior}/${slug}`,
      request: {
        domain: ValidatorDomain.AgenticBehavior,
        slug,
        data: standardValidationData(ValidatorDomain.AgenticBehavior),
        config: { threshold: 0.5 },
      },
    });
  }

  for (const slug of enumValues(McpSecurity)) {
    cases.push({
      name: `validator ${ValidatorDomain.McpSecurity}/${slug}`,
      request: {
        domain: ValidatorDomain.McpSecurity,
        slug,
        data: standardValidationData(ValidatorDomain.McpSecurity),
        config: { threshold: 0.5 },
      },
    });
  }

  cases.push({
    name: `validator ${ValidatorDomain.ThemesClassifier}/${ThemesClassifier.Classify}`,
    request: {
      domain: ValidatorDomain.ThemesClassifier,
      slug: ThemesClassifier.Classify,
      data: {
        text: 'This text discusses AI safety, privacy, and evaluation.',
        return_subthemes: true,
        max_themes: 3,
      },
    },
  });

  cases.push({
    name: `validator ${ValidatorDomain.Composite}/${Composite.Evaluate}`,
    request: {
      domain: ValidatorDomain.Composite,
      slug: Composite.Evaluate,
      data: {
        llm_input_query: 'What is the capital of France?',
        llm_input_context: 'Paris is the capital city of France.',
        llm_output: 'The capital of France is Paris.',
      },
    },
  });

  return cases;
}

async function runValidationSmoke(fetcher) {
  const clientConfig = {
    apiKey: isLive ? requiredEnv('DISSEQT_API_KEY') : 'mock-api-key',
    projectId: isLive ? requiredEnv('DISSEQT_PROJECT_ID') : 'mock-project-id',
    ...(validationBaseUrl ? { baseUrl: validationBaseUrl } : {}),
    ...(fetcher ? { fetch: fetcher } : {}),
  };
  const client = new Client(clientConfig);

  for (const testCase of validationCases()) {
    try {
      const result = await client.validate(testCase.request);
      if (result === null || typeof result !== 'object') {
        throw new Error('validator returned a non-object response');
      }
      pass(testCase.name);
    } catch (error) {
      fail(testCase.name, error);
    }
  }
}

function configureSpan(span, kind) {
  span.setAttribute('smoke.kind', kind);

  if (kind === SpanKind.ModelExec) {
    span
      .setModelInfo('gpt-4', 'openai')
      .setMessages([{ role: 'user', content: 'Hello' }], [{ role: 'assistant', content: 'Hi' }])
      .setTokenUsage(10, 5);
  } else if (kind === SpanKind.ToolExec) {
    span.setToolInfo('get_weather', 'call-001');
  } else if (kind === SpanKind.AgentExec) {
    span.setAgentInfo('assistant', 'agent-001', '1.0.0');
  } else if (kind === SpanKind.RagExec) {
    span.setAttribute('agentic.input.context', 'Paris is the capital of France.');
  } else if (kind === SpanKind.McpExec) {
    span.setAttribute('mcp.protocol.version', '1.0');
  }
}

async function runSpanSmoke(fetcher, mockCalls) {
  const client = new DisseqtAgenticClient({
    apiKey: isLive ? requiredEnv('DISSEQT_API_KEY') : 'mock-api-key',
    projectId: isLive ? requiredEnv('DISSEQT_PROJECT_ID') : 'mock-project-id',
    serviceName: 'disseqt-node-sdk-smoke',
    ...(agenticEndpoint ? { endpoint: agenticEndpoint } : {}),
    maxBatchSize: 100,
    flushIntervalMs: 60_000,
    ...(fetcher ? { fetch: fetcher } : {}),
  });

  try {
    const spanKinds = [...enumValues(SpanKind), 'CUSTOM_OPERATION'];
    await startTrace(client, 'all_span_kinds_smoke').run(async (trace) => {
      for (const kind of spanKinds) {
        const span = trace.startSpan(`span_${String(kind).toLowerCase()}`, kind);
        configureSpan(span, kind);
        span.close();
      }
    });

    await client.flush();

    if (!isLive) {
      const agenticCall = mockCalls.find((call) => call.url.includes('/agentic-monitoring/'));
      const spans = agenticCall?.body?.traces?.flatMap((trace) => trace.spans) ?? [];
      const emittedKinds = new Set(spans.map((span) => span.spanKind));
      for (const kind of spanKinds) {
        if (!emittedKinds.has(kind)) {
          throw new Error(`missing span kind in emitted payload: ${kind}`);
        }
      }
    }

    pass(`agentic spans ${spanKinds.length} kinds`);
  } catch (error) {
    fail('agentic spans all kinds', error);
  } finally {
    await client.shutdown();
  }
}

async function main() {
  const mockCalls = [];
  const fetcher = isLive ? undefined : makeMockFetch(mockCalls);
  info(`mode=${isLive ? 'live' : 'mock'} validators=${validationCases().length} spans=${enumValues(SpanKind).length + 1}`);

  try {
    await runValidationSmoke(fetcher);
    await runSpanSmoke(fetcher, mockCalls);
  } catch (error) {
    fail('smoke setup', error);
  }

  writeLine(`[SUMMARY] passed=${summary.passed} failed=${summary.failed}`);
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

await main();
