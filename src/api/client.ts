import type { Asset, AssetPage, AssetQuery, BulkResult } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status?.length) params.set("status", query.status.join(","));
  if (query.kind?.length) params.set("kind", query.kind.join(","));
  if (query.tag?.length) params.set("tag", query.tag.join(","));
  if (query.collectionId) params.set("collectionId", query.collectionId);
  if (query.owner) params.set("owner", query.owner);
  if (query.sort) params.set("sort", query.sort);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      });
      if (res.ok) return res.json() as Promise<T>;
      let code = "request_failed";
      let detail = "The service did not complete that request.";
      try {
        const body = await res.json();
        code = body?.error?.code ?? code;
        detail = body?.error?.message ?? detail;
      } catch {
        // Keep a useful message when a proxy returns non-JSON.
      }
      const retryAfter = Number(res.headers.get("Retry-After"));
      const error = new ApiError(res.status, code, detail, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
      if (![429, 500, 503].includes(res.status) || attempt === 3) throw error;
      await delay(error.retryAfterMs ?? 250 * 2 ** attempt + Math.random() * 200);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof ApiError) {
        if (![429, 500, 503].includes(error.status) || attempt === 3) throw error;
        await delay(error.retryAfterMs ?? 250 * 2 ** attempt + Math.random() * 200);
        continue;
      }
      if (attempt === 3) throw error;
      await delay(250 * 2 ** attempt + Math.random() * 200);
    }
  }
  throw new Error("Request failed after retries.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function listAssets(query: AssetQuery, signal?: AbortSignal): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, { signal });
}

export function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, { signal });
}

export function getAssetsByIds(ids: string[]): Promise<{ items: Asset[]; missing: string[] }> {
  // Note: the endpoint rejects more than 25 ids per call.
  return request(`/api/assets/batch?ids=${ids.join(",")}`);
}

export function updateAsset(id: string, version: number, patch: Partial<Pick<Asset, "name" | "status" | "tags">>): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ version, patch }),
  });
}

export function bulkSetStatus(ids: string[], status: Asset["status"]): Promise<BulkResult> {
  // Note: the endpoint rejects more than 50 ids per call.
  return request<BulkResult>("/api/assets/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
