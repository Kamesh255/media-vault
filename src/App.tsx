import { useCallback, useEffect, useRef, useState } from "react";
import { bulkSetStatus } from "@/api/client";
import { AssetDetail } from "@/features/assets/AssetDetail";
import { AssetGrid } from "@/features/assets/AssetGrid";
import { useAssets } from "@/features/assets/useAssets";
import { statusLabel } from "@/lib/format";
import type { Asset, AssetKind, AssetQuery, AssetStatus } from "@/lib/types";

const STATUSES: AssetStatus[] = ["draft", "in_review", "approved", "archived"];
const KINDS: AssetKind[] = ["image", "video", "document"];
const SORTS: Array<{ value: NonNullable<AssetQuery["sort"]>; label: string }> = [
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "name:asc", label: "Name A-Z" },
  { value: "sizeBytes:desc", label: "Largest first" },
  { value: "createdAt:desc", label: "Newest" },
];

function readQuery(): AssetQuery {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    status: (params.get("status")?.split(",").filter(Boolean) as AssetStatus[]) ?? [],
    kind: (params.get("kind")?.split(",").filter(Boolean) as AssetKind[]) ?? [],
    tag: params.get("tag")?.split(",").filter(Boolean),
    sort: (params.get("sort") as AssetQuery["sort"]) ?? "updatedAt:desc",
    limit: 50,
  };
}

export function App() {
  const [query, setQuery] = useState<AssetQuery>(readQuery);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<Map<string, Asset>>(new Map());
  const [failedBulk, setFailedBulk] = useState<Array<{ id: string; code: string; message?: string; retryable: boolean }>>([]);
  const [lastBulkStatus, setLastBulkStatus] = useState<AssetStatus | null>(null);
  const lastSelected = useRef<string | null>(null);
  const lastOpened = useRef<HTMLElement | null>(null);
  const { items, total, loading, error, retry, loadMore, hasMore, online } = useAssets(query);
  const displayItems = items.map((asset) => optimistic.get(asset.id) ?? asset);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.kind?.length) params.set("kind", query.kind.join(","));
    if (query.tag?.length) params.set("tag", query.tag.join(","));
    if (query.sort) params.set("sort", query.sort);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    setSelectedIds(new Set());
  }, [query]);

  useEffect(() => {
    if (!activeId) lastOpened.current?.focus();
  }, [activeId]);

  const updateQuery = useCallback((patch: Partial<AssetQuery>) => setQuery((current) => ({ ...current, ...patch })), []);

  const toggleSelect = useCallback(
    (id: string, extend = false) => {
      setSelectedIds((previous) => {
        const next = new Set(previous);
        if (extend && lastSelected.current) {
          const start = items.findIndex((asset) => asset.id === lastSelected.current);
          const end = items.findIndex((asset) => asset.id === id);
          if (start >= 0 && end >= 0) {
            for (const asset of items.slice(Math.min(start, end), Math.max(start, end) + 1)) next.add(asset.id);
          }
        } else next.has(id) ? next.delete(id) : next.add(id);
        lastSelected.current = id;
        return next;
      });
    },
    [items],
  );

  const openAsset = useCallback((id: string) => {
    lastOpened.current = document.activeElement as HTMLElement;
    setActiveId(id);
  }, []);

  async function applyBulkStatus(next: AssetStatus, idsOverride?: string[]) {
    const ids = idsOverride ?? [...selectedIds];
    if (!ids.length) return;
    setBusy(true);
    setLastBulkStatus(next);
    setNotice("Updating selected assets...");
    setOptimistic((current) => {
      const nextMap = new Map(current);
      items.filter((asset) => ids.includes(asset.id)).forEach((asset) => nextMap.set(asset.id, { ...asset, status: next }));
      return nextMap;
    });
    let applied = 0;
    let failed = 0;
    const failureReasons: string[] = [];
    const failures: Array<{ id: string; code: string; message?: string; retryable: boolean }> = [];
    try {
      for (let index = 0; index < ids.length; index += 50) {
        const result = await bulkSetStatus(ids.slice(index, index + 50), next);
        applied += result.applied;
        failed += result.failed;
        result.results.forEach((item) => {
          if (item.ok) setOptimistic((current) => new Map(current).set(item.id, item.asset));
          else {
            failureReasons.push(`${item.id}: ${item.code}`);
            failures.push({ id: item.id, code: item.code, message: item.message, retryable: item.code === "conflict" });
            setOptimistic((current) => {
              const nextMap = new Map(current);
              nextMap.delete(item.id);
              return nextMap;
            });
          }
        });
      }
      setSelectedIds(new Set());
      setFailedBulk(failures);
      setNotice(failed ? `${applied} updated. ${failed} rolled back (${failureReasons.slice(0, 3).join(", ")}${failureReasons.length > 3 ? ", ..." : ""}).` : `${applied} assets moved to ${statusLabel(next)}.`);
    } catch {
      setNotice("The bulk update could not be completed. Your selection is still available to retry.");
    } finally {
      setBusy(false);
    }
  }

  function retryFailedBulk() {
    const retryableIds = failedBulk.filter((failure) => failure.retryable).map((failure) => failure.id);
    if (!retryableIds.length || !lastBulkStatus) return;
    setFailedBulk([]);
    void applyBulkStatus(lastBulkStatus, retryableIds);
  }

  function handleSaved(_asset: Asset) {
    setNotice("Asset saved. Refresh the current results to see the latest server state.");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">MEDIA LIBRARY</p>
          <h1>MediaVault</h1>
        </div>
        <label className="search-wrap">
          <span className="sr-only">Search assets</span>
          <input className="search" type="search" placeholder="Search by name or tag" value={query.q ?? ""} onChange={(event) => updateQuery({ q: event.target.value })} />
        </label>
        <select aria-label="Sort assets" value={query.sort} onChange={(event) => updateQuery({ sort: event.target.value as AssetQuery["sort"] })}>
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>
      <div className="filters">
        <span className="filter-label">STATUS</span>
        {STATUSES.map((status) => (
          <label key={status}>
            <input type="checkbox" checked={query.status?.includes(status) ?? false} onChange={(event) => updateQuery({ status: event.target.checked ? [...(query.status ?? []), status] : (query.status ?? []).filter((item) => item !== status) })} />
            {statusLabel(status)}
          </label>
        ))}
        <span className="filter-label">TYPE</span>
        {KINDS.map((kind) => (
          <label key={kind}>
            <input type="checkbox" checked={query.kind?.includes(kind) ?? false} onChange={(event) => updateQuery({ kind: event.target.checked ? [...(query.kind ?? []), kind] : (query.kind ?? []).filter((item) => item !== kind) })} />
            {kind}
          </label>
        ))}
        <label className="tag-filter">
          <span className="sr-only">Filter by tag</span>
          <input
            aria-label="Filter by tag"
            placeholder="Tag"
            value={query.tag?.join(",") ?? ""}
            onChange={(event) =>
              updateQuery({
                tag: event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <button className="quiet" onClick={() => setSelectedIds(new Set(items.map((asset) => asset.id)))} disabled={!items.length}>
          Select all loaded
        </button>
        <span className="count" aria-live="polite">
          {loading ? "Loading..." : `${items.length} of ${total.toLocaleString()} assets`}
        </span>
      </div>
      {!online && (
        <div className="offline" role="status">
          You are offline. We will resume loading when the connection returns.
        </div>
      )}
      {selectedIds.size > 0 && (
        <div className="bulkbar" role="toolbar" aria-label="Bulk actions">
          <strong>{selectedIds.size} selected</strong>
          <button disabled={busy} onClick={() => void applyBulkStatus("in_review")}>
            Move to review
          </button>
          <button disabled={busy} onClick={() => void applyBulkStatus("approved")}>
            Approve
          </button>
          <button disabled={busy} onClick={() => void applyBulkStatus("archived")}>
            Archive
          </button>
          <button className="quiet" onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {failedBulk.length > 0 && (
        <div className="failure-list" role="status">
          <strong>Items that did not change</strong>
          <ul>
            {failedBulk.map((failure) => (
              <li key={failure.id}>
                {failure.id}: {failure.message ?? failure.code}
                {failure.retryable ? " (retry available)" : ""}
              </li>
            ))}
          </ul>
          {failedBulk.some((failure) => failure.retryable) && <button onClick={retryFailedBulk}>Retry temporary failures</button>}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          We could not load these assets. <button onClick={retry}>Try again</button>
        </p>
      )}
      <main className="content">
        <AssetGrid assets={displayItems} selectedIds={selectedIds} activeId={activeId} onToggleSelect={toggleSelect} onOpen={openAsset} onLoadMore={loadMore} hasMore={hasMore} loading={loading} hasError={Boolean(error)} />
        {activeId && <AssetDetail id={activeId} onClose={() => setActiveId(null)} onSaved={handleSaved} />}
      </main>
    </div>
  );
}
