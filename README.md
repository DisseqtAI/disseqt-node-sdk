# Disseqt SDK for Node.js

Node.js SDK for Disseqt AI validation, prompt packs, and agentic tracing.

> This repository is being bootstrapped from the production Python SDK behavior. The implementation should preserve the same HTTP headers, endpoint paths, payload shapes, and response semantics while exposing idiomatic TypeScript APIs.

## Installation

```bash
npm install @disseqt/ai-sdk
```

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Package Surfaces

- Validation SDK: LLM input/output, RAG grounding, agentic behavior, MCP security, themes classifier, and composite scoring validators.
- Prompt Packs SDK: prompt pack lifecycle REST client.
- Agentic SDK: trace/span observability with batching.

## Compatibility Target

The Node SDK should match the current Python SDK behavior for:

- Headers: `X-API-Key`, `X-Project-Id`, and `Content-Type: application/json`
- Validation default base URL: `https://production-monitoring-eu.disseqt.ai`
- Validation path: `/api/v1/sdk/validators/{domain}/{validator}`
- Prompt Packs default base URL: `http://localhost:8000`
- Prompt Packs path prefix: `/sdk/prompt-packs/api/v1/sdk/prompt-packs`

See [TODO.md](./TODO.md) for the production-readiness checklist and commit plan.
