import { DisseqtError } from '../http/errors.js';
import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

// Service-key mount (server.go sdkPromptPackRoutes). /api/v1/prompt-packs is
// the browser-session mount and rejects API-key callers (ErrAuthHeaderRequired).
const ROOT = '/api/v1/sdk/prompt-packs';

/** publishPromptPack binds `oneof=PRIVATE PROJECT ORGANIZATION PUBLIC`. */
export const PACK_SHARING_SCOPES = ['PRIVATE', 'PROJECT', 'ORGANIZATION', 'PUBLIC'] as const;

export type PackSharingScope = (typeof PACK_SHARING_SCOPES)[number];

/** Prompt-pack CRUD + related actions (publish, duplicate, download, etc). */
export class PacksClient extends ResourceBase {
  /**
   * GET / — the **marketplace** catalog (published packs visible to the
   * caller). A pack you just created is not in here; use {@link listMine}.
   */
  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', ROOT, params ? { params } : {});
  }

  /** GET /my-packs — packs owned by the calling user (getUserOwnedPacks). */
  listMine(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/my-packs`, params ? { params } : {});
  }

  get(id: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}`);
  }

  create(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', ROOT, { json: payload });
  }

  update(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('PATCH', `${ROOT}/${id}`, { json: payload });
  }

  delete(id: string): Promise<JsonObject> {
    return this._request('DELETE', `${ROOT}/${id}`);
  }

  duplicate(id: string, payload?: JsonValue): Promise<JsonObject> {
    return this._request(
      'POST',
      `${ROOT}/${id}/duplicate`,
      payload !== undefined ? { json: payload } : {},
    );
  }

  /**
   * PATCH /:id/publish. `sharing_scope` is a **required** body field
   * (publishPromptPack binds it); omitting the body is a 400 `EOF`.
   * Non-admin packs are additionally rejected server-side for `PUBLIC`.
   */
  publish(id: string, sharingScope: PackSharingScope = 'PRIVATE'): Promise<JsonObject> {
    if (!PACK_SHARING_SCOPES.includes(sharingScope)) {
      throw new DisseqtError(
        `invalid sharing scope ${JSON.stringify(sharingScope)}; expected one of ${PACK_SHARING_SCOPES.join(', ')}`,
      );
    }
    return this._request('PATCH', `${ROOT}/${id}/publish`, {
      json: { sharing_scope: sharingScope },
    });
  }

  /** PATCH /:id/unpublish — no body (unpublishPromptPack binds none). */
  unpublish(id: string): Promise<JsonObject> {
    return this._request('PATCH', `${ROOT}/${id}/unpublish`);
  }

  download(id: string): Promise<{ status: number; headers: Headers; text: string }> {
    return this._requestRaw('GET', `${ROOT}/${id}/download`);
  }

  listPrompts(id: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}/prompts`, params ? { params } : {});
  }

  listReviews(id: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}/reviews`, params ? { params } : {});
  }

  submitReview(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/reviews`, { json: payload });
  }

  rate(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/ratings`, { json: payload });
  }
}
