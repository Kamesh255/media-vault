import { memo, useCallback, useEffect, useRef, useState } from "react";
import { thumbnailUrl } from "@/api/client";
import { formatBytes, formatDate, statusLabel } from "@/lib/format";
import type { Asset } from "@/lib/types";

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string, extend?: boolean) => void;
  onOpen: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  hasError: boolean;
}

/** The grid keeps the scroll surface large while rendering only nearby rows. */
const ROW_HEIGHT = 282;

const AssetCard = memo(function AssetCard({ asset, selected, active, tabIndex, onToggleSelect, onOpen, onMove }: { asset: Asset; selected: boolean; active: boolean; tabIndex: number; onToggleSelect: (id: string, extend?: boolean) => void; onOpen: (id: string) => void; onMove: (id: string, delta: number, extend: boolean) => void }) {
  return (
    <div
      role="gridcell"
      data-asset-id={asset.id}
      tabIndex={tabIndex}
      aria-selected={selected}
      className={"card" + (selected ? " card--selected" : "") + (active ? " card--active" : "")}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(asset.id);
        if (event.key === " ") {
          event.preventDefault();
          onToggleSelect(asset.id, event.shiftKey);
        }
        if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 4 : -4;
          onMove(asset.id, delta, event.shiftKey);
        }
      }}
      onClick={(event) => onToggleSelect(asset.id, event.shiftKey)}
    >
      {asset.hasThumbnail ? (
        <img
          className="card__thumb"
          src={thumbnailUrl(asset.id)}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="card__thumb card__thumb--missing">No preview</div>
      )}
      <div className="card__body">
        <p className="card__name">{asset.name}</p>
        <p className="muted">
          {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
        </p>
        <span className={`pill pill--${asset.status}`}>{statusLabel(asset.status)}</span>
      </div>
      <input aria-label={`Select ${asset.name}`} type="checkbox" className="card__check" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onToggleSelect(asset.id, event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey)} />
    </div>
  );
});

export function AssetGrid({ assets, selectedIds, activeId, onToggleSelect, onOpen, onLoadMore, hasMore, loading, hasError }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columns, setColumns] = useState(4);
  const [focusedId, setFocusedId] = useState(assets[0]?.id ?? null);
  useEffect(() => {
    const update = () => setColumns(Math.max(1, Math.floor((gridRef.current?.clientWidth ?? 960) / 254)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    if (!focusedId || !assets.some((asset) => asset.id === focusedId)) setFocusedId(assets[0]?.id ?? null);
  }, [assets, focusedId]);

  const moveFocus = useCallback(
    (id: string, delta: number, extend: boolean) => {
      const currentIndex = assets.findIndex((asset) => asset.id === id);
      const next = assets[Math.max(0, Math.min(assets.length - 1, currentIndex + (delta === 4 || delta === -4 ? columns * (delta > 0 ? 1 : -1) : delta)))];
      if (!next) return;
      setFocusedId(next.id);
      if (extend) onToggleSelect(next.id, true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-asset-id="${next.id}"]`)?.focus());
    },
    [assets, columns, onToggleSelect],
  );
  if (loading && assets.length === 0) {
    return (
      <div className="empty" role="status">
        <p>Loading assets...</p>
        <p className="muted">Preparing the latest library results.</p>
      </div>
    );
  }

  if (hasError && assets.length === 0) {
    return (
      <div className="empty" role="status">
        <p>These results could not be loaded.</p>
        <p className="muted">Use the retry action above to try again.</p>
      </div>
    );
  }

  if (!loading && assets.length === 0) {
    return (
      <div className="empty" role="status">
        <p>Nothing matches these filters.</p>
        <p className="muted">Clear the search box or widen the status filter.</p>
      </div>
    );
  }

  return (
    <div
      ref={gridRef}
      className="grid"
      role="grid"
      aria-label="Media assets"
      onScroll={(event) => {
        const target = event.currentTarget;
        setScrollTop(target.scrollTop);
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 500) onLoadMore();
      }}
    >
      <div className="virtual-content" style={{ height: Math.ceil(assets.length / columns) * ROW_HEIGHT }}>
        {Array.from({ length: Math.ceil(assets.length / columns) }, (_, rowIndex) => rowIndex)
          .filter((rowIndex) => rowIndex * ROW_HEIGHT < scrollTop + (gridRef.current?.clientHeight ?? 600) + ROW_HEIGHT && (rowIndex + 1) * ROW_HEIGHT > scrollTop - ROW_HEIGHT)
          .map((rowIndex) => (
            <div className="virtual-row" key={rowIndex} style={{ top: rowIndex * ROW_HEIGHT, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {assets.slice(rowIndex * columns, (rowIndex + 1) * columns).map((asset) => (
                <AssetCard key={asset.id} asset={asset} selected={selectedIds.has(asset.id)} active={activeId === asset.id} tabIndex={focusedId === asset.id ? 0 : -1} onToggleSelect={onToggleSelect} onOpen={onOpen} onMove={moveFocus} />
              ))}
            </div>
          ))}
      </div>
      {loading && (
        <div className="loading" role="status">
          Loading more assets...
        </div>
      )}
      {!loading && hasMore && (
        <button className="load-more" onClick={onLoadMore}>
          Load more
        </button>
      )}
    </div>
  );
}
