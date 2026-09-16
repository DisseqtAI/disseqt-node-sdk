import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

// ponytail: bonus resources — only the CRUD verbs the task explicitly named
// are enumerated. Add specialty methods when concrete endpoints land, not now.

/** RAG target integrations. */
export class RagTargetsClient extends ResourceBase {
  private readonly root = '/api/v1/llm/rag-integrations';
  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', this.root, params ? { params } : {});
  }
  get(id: string): Promise<JsonObject> {
    return this._request('GET', `${this.root}/${id}`);
  }
  create(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', this.root, { json: payload });
  }
  update(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('PATCH', `${this.root}/${id}`, { json: payload });
  }
  delete(id: string): Promise<JsonObject> {
    return this._request('DELETE', `${this.root}/${id}`);
  }
}

/** MCP target integrations. */
export class McpTargetsClient extends ResourceBase {
  private readonly root = '/api/v1/llm/mcp-integrations';
  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', this.root, params ? { params } : {});
  }
  get(id: string): Promise<JsonObject> {
    return this._request('GET', `${this.root}/${id}`);
  }
  create(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', this.root, { json: payload });
  }
  update(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('PATCH', `${this.root}/${id}`, { json: payload });
  }
  delete(id: string): Promise<JsonObject> {
    return this._request('DELETE', `${this.root}/${id}`);
  }
}

/** Vulnerabilities catalog / findings. */
export class VulnerabilitiesClient extends ResourceBase {
  private readonly root = '/api/v1/vulnerabilities';
  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', this.root, params ? { params } : {});
  }
  get(id: string): Promise<JsonObject> {
    return this._request('GET', `${this.root}/${id}`);
  }
  /** POST /api/v1/vulnerabilities/{id}/test — fire-and-forget. */
  test(id: string, payload?: JsonValue): Promise<JsonObject> {
    return this._request(
      'POST',
      `${this.root}/${id}/test`,
      payload !== undefined ? { json: payload } : {},
    );
  }
  /** POST /api/v1/vulnerabilities/{id}/test/poll — blocks until scored. */
  testPoll(id: string, payload?: JsonValue): Promise<JsonObject> {
    return this._request(
      'POST',
      `${this.root}/${id}/test/poll`,
      payload !== undefined ? { json: payload } : {},
    );
  }
}

// NOTE: MultiTurnClient (previously exposed as `client.mr`) was removed
// because no backend registers /api/v1/mr — the multi-turn surface lives at
// /api/v1/mr-jailbreak/* (mr_jailbreak_routes.go:17). All four methods hit
// unregistered routes. The functionality already exists on RedteamClient:
//   getMrJob             GET  /api/v1/mr-jailbreak/jobs/:id
//   getMrJobInteractions GET  /api/v1/mr-jailbreak/jobs/:id/interactions
//   batchAutomate        POST /api/v1/mr-jailbreak/batch-automate
//   listMultiTurnTechniques / listAgents
// Chose Option (i) delete over Option (ii) rename because the class name
// implied a generic /api/v1/mr root that does not exist in any form.
