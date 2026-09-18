import { useEffect, useState } from "react";
import { ApiError, getAsset, thumbnailUrl, updateAsset } from "@/api/client";
import { formatBytes, formatDate, formatDuration, statusLabel } from "@/lib/format";
import type { Asset, AssetStatus } from "@/lib/types";

const STATUSES: AssetStatus[] = ["draft", "in_review", "approved", "archived"];

interface Props {
  id: string;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

export function AssetDetail({ id, onClose, onSaved }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setAsset(null);
    setError(null);
    getAsset(id, controller.signal)
      .then(setAsset)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError && err.code === "not_found" ? "This asset is no longer available." : "The asset could not be loaded. Try closing and reopening it.");
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function setStatus(status: AssetStatus) {
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAsset(asset.id, asset.version, { status });
      setAsset(updated);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "version_conflict" ? "This asset changed elsewhere. Close and reopen it to review the latest version before saving again." : "The asset could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="panel" aria-labelledby="detail-title">
      <div className="panel__head">
        <h2 id="detail-title">Asset detail</h2>
        <button autoFocus onClick={onClose}>
          Close
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {!asset && !error && <p className="muted">Loading…</p>}

      {asset && (
        <div className="panel__body">
          {asset.hasThumbnail ? <img className="panel__thumb" src={thumbnailUrl(asset.id)} alt="" /> : <div className="panel__thumb panel__thumb--missing">No preview available</div>}
          <h3>{asset.name}</h3>
          <dl className="facts">
            <dt>Id</dt>
            <dd>{asset.id}</dd>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
            {asset.width && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {asset.width}×{asset.height}
                </dd>
              </>
            )}
            {asset.durationSec && (
              <>
                <dt>Duration</dt>
                <dd>{formatDuration(asset.durationSec)}</dd>
              </>
            )}
            <dt>Owner</dt>
            <dd>{asset.owner.name}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(asset.updatedAt)}</dd>
            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul className="tags">
              {asset.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          <p className="muted">Status</p>
          <div className="row">
            {STATUSES.map((status) => (
              <button key={status} disabled={saving || status === asset.status} onClick={() => setStatus(status)}>
                {statusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
