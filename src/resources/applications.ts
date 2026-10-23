import type { JsonObject, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

/** policy-management gateway prefix; serves the AI System (application) registry. */
export const POLICIES_DEFAULT_BASE_URL = 'https://api.disseqt.ai/policy';

/** AI Systems — policy-mgmt `GET /api/v1/applications` → `{applications, count}`. */
export class ApplicationsClient extends ResourceBase {
  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', '/api/v1/applications', params ? { params } : {});
  }
  get(applicationId: string): Promise<JsonObject> {
    return this._request('GET', `/api/v1/applications/${applicationId}`);
  }
}

const LINKS = '/api/v1/llm/application-links';
const LINK_BUCKETS = [
  'app_integrations',
  'llm_integrations',
  'rag_integrations',
  'mcp_integrations',
];

/** AI System ↔ integration links on dataset-backend (api/application_links.go). */
export class ApplicationLinksClient extends ResourceBase {
  /** Link an app integration (the only target kind red-team flows accept today). */
  create(applicationId: string, integrationId: string, role?: string): Promise<JsonObject> {
    return this._request('POST', LINKS, {
      json: {
        application_id: applicationId,
        integration_type: 'app_integration',
        integration_id: integrationId,
        ...(role !== undefined ? { role } : {}),
      },
    });
  }
  list(applicationId: string): Promise<JsonObject> {
    return this._request('GET', LINKS, { params: { application_id: applicationId } });
  }
  delete(linkId: string): Promise<JsonObject> {
    return this._request('DELETE', `${LINKS}/${linkId}`);
  }
  /** Delete every link of an AI System; returns the deleted link ids. */
  async unlinkAll(applicationId: string): Promise<string[]> {
    const listed = await this.list(applicationId);
    const ids = LINK_BUCKETS.flatMap((bucket) => {
      const rows = listed[bucket];
      return Array.isArray(rows) ? rows.map((r) => String((r as JsonObject)['id'] ?? '')) : [];
    }).filter((id) => id.length > 0);
    for (const id of ids) await this.delete(id);
    return ids;
  }
}
