import React, { useEffect, useState, useCallback } from "react";
import { api, ConcurrencyConflictException } from "../services/api";
import { PricingItem, Store, ConcurrencyConflictDetails } from "../types";

export const PricingSearchView: React.FC = () => {
  const [pricingList, setPricingList] = useState<PricingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [loading, setLoading] = useState(false);

  // Filters
  const [query, setQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");

  const [stores, setStores] = useState<Store[]>([]);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<PricingItem | null>(null);
  const [editPriceInput, setEditPriceInput] = useState<string>("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Concurrency Conflict Modal State
  const [conflictModalData, setConflictModalData] = useState<{
    item: PricingItem;
    conflict: ConcurrencyConflictDetails;
  } | null>(null);

  // Fetch stores for filter dropdown
  useEffect(() => {
    api.getStores().then(setStores).catch(console.error);
  }, []);

  const loadPricing = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getPricing({
        q: query || undefined,
        store_code: selectedStore || undefined,
        country_code: selectedCountry || undefined,
        min_price: minPrice ? parseFloat(minPrice) : undefined,
        max_price: maxPrice ? parseFloat(maxPrice) : undefined,
        page,
        limit,
      });
      setPricingList(res.items);
      setTotal(res.total);
    } catch (err: any) {
      console.error("Failed to load pricing:", err);
    } finally {
      setLoading(false);
    }
  }, [query, selectedStore, selectedCountry, minPrice, maxPrice, page, limit]);

  useEffect(() => {
    loadPricing();
  }, [loadPricing]);

  const handleOpenEdit = async (item: PricingItem) => {
    setEditError(null);
    setEditPriceInput(item.price.toString());
    try {
      // Fetch fresh details with audits
      const fresh = await api.getPricingById(item.id);
      setEditingItem(fresh);
    } catch {
      setEditingItem(item);
    }
  };

  const handleCloseEdit = () => {
    setEditingItem(null);
    setEditError(null);
    setEditPriceInput("");
  };

  const handleSavePrice = async () => {
    if (!editingItem) return;

    const numPrice = parseFloat(editPriceInput);
    if (isNaN(numPrice) || numPrice < 0) {
      setEditError("Please enter a valid non-negative price");
      return;
    }

    // Check decimal precision (max 2 decimals)
    const parts = editPriceInput.split(".");
    if (parts.length > 1 && parts[1].length > 2) {
      setEditError("Price cannot exceed 2 decimal places (excess precision rejected)");
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);

      // Perform optimistic concurrency update
      await api.updatePricing(
        editingItem.id,
        numPrice,
        editingItem.version
      );

      // Successfully updated!
      setEditingItem(null);
      loadPricing();
    } catch (err: any) {
      if (err instanceof ConcurrencyConflictException) {
        // Concurrency conflict occurred!
        setConflictModalData({
          item: editingItem,
          conflict: err.conflictDetails,
        });
        setEditingItem(null);
      } else {
        setEditError(err.message || "Failed to update price");
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleReloadAfterConflict = async () => {
    if (!conflictModalData) return;
    try {
      const fresh = await api.getPricingById(conflictModalData.item.id);
      setConflictModalData(null);
      setEditingItem(fresh);
      setEditPriceInput(fresh.price.toString());
      loadPricing();
    } catch {
      setConflictModalData(null);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="content-body">
      {/* Search & Filters Bar */}
      <div className="panel">
        <div className="search-filters-bar">
          <div style={{ flex: "2", minWidth: "240px" }} className="input-group">
            <label htmlFor="search-input">Search Catalog</label>
            <input
              id="search-input"
              type="text"
              placeholder="Search store code, name, SKU, product..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div style={{ flex: "1", minWidth: "160px" }} className="input-group">
            <label htmlFor="store-select">Store</label>
            <select
              id="store-select"
              value={selectedStore}
              onChange={(e) => {
                setSelectedStore(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Stores</option>
              {stores.map((s) => (
                <option key={s.store_code} value={s.store_code}>
                  {s.store_code} ({s.name})
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1", minWidth: "120px" }} className="input-group">
            <label htmlFor="country-select">Country</label>
            <select
              id="country-select"
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Countries</option>
              <option value="US">US (United States)</option>
              <option value="GB">GB (United Kingdom)</option>
              <option value="CA">CA (Canada)</option>
              <option value="DE">DE (Germany)</option>
            </select>
          </div>

          <div style={{ width: "100px" }} className="input-group">
            <label htmlFor="min-price-input">Min Price</label>
            <input
              id="min-price-input"
              type="number"
              placeholder="0.00"
              value={minPrice}
              onChange={(e) => {
                setMinPrice(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div style={{ width: "100px" }} className="input-group">
            <label htmlFor="max-price-input">Max Price</label>
            <input
              id="max-price-input"
              type="number"
              placeholder="999.00"
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {(query || selectedStore || selectedCountry || minPrice || maxPrice) && (
            <div style={{ alignSelf: "flex-end" }}>
              <button
                id="clear-filters-btn"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setQuery("");
                  setSelectedStore("");
                  setSelectedCountry("");
                  setMinPrice("");
                  setMaxPrice("");
                  setPage(1);
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Pricing Table */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Store Code & Name</th>
                <th>Product SKU & Description</th>
                <th>Region</th>
                <th>Currency</th>
                <th>Current Price</th>
                <th>Version Token</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "40px" }}>
                    Loading pricing records...
                  </td>
                </tr>
              ) : pricingList.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "40px" }}>
                    <div style={{ color: "var(--text-muted)" }}>
                      No pricing records found matching current criteria.
                    </div>
                  </td>
                </tr>
              ) : (
                pricingList.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      opacity: item.active !== false ? 1 : 0.65,
                      background: item.active === false ? "rgba(239, 68, 68, 0.03)" : undefined,
                    }}
                  >
                    <td>
                      <div style={{ fontWeight: 600, color: "#fff" }}>{item.store_code}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.store_name}</div>
                    </td>
                    <td>
                      <span className="token" style={{ color: "#818cf8" }}>{item.product_sku}</span>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-primary)", marginTop: "2px" }}>
                        {item.product_name}
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "#fff" }}>
                        {item.country_code}
                      </span>
                    </td>
                    <td><strong style={{ color: "var(--text-muted)" }}>{item.currency_code}</strong></td>
                    <td>
                      <span className="price-text" style={{ color: item.active !== false ? "#38bdf8" : "var(--text-muted)" }}>
                        {item.currency_code === "USD" ? "$" : item.currency_code === "GBP" ? "£" : item.currency_code === "EUR" ? "€" : "$"}
                        {parseFloat(item.price).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span className="token" title="Optimistic concurrency version">
                        v{item.version}
                      </span>
                    </td>
                    <td>
                      {item.active !== false ? (
                        <span className="badge badge-completed" style={{ fontSize: "0.68rem" }}>
                          ACTIVE
                        </span>
                      ) : (
                        <span className="badge badge-failed" style={{ fontSize: "0.68rem" }}>
                          DEACTIVATED
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      <div>{new Date(item.updated_at).toLocaleDateString()}</div>
                      <div style={{ fontSize: "0.72rem" }}>by {item.updated_by}</div>
                    </td>
                    <td>
                      <button
                        id={`edit-pricing-btn-${item.id}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenEdit(item)}
                      >
                        ✏️ Edit Price
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="pagination-bar">
          <div>
            Showing <strong>{pricingList.length}</strong> of <strong>{total}</strong> records (Page {page} of {totalPages})
          </div>
          <div className="pagination-controls">
            <button
              id="pagination-prev-btn"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              id="pagination-next-btn"
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Edit Price Modal with Optimistic Concurrency */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 className="panel-title">Edit Store Price</h3>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Optimistic Concurrency Control Enabled (Atomic Version Lock)
                </div>
              </div>
              <button
                id="close-edit-modal-btn"
                className="btn btn-secondary btn-sm"
                onClick={handleCloseEdit}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "rgba(10, 13, 20, 0.4)", padding: "14px", borderRadius: "8px" }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Store</div>
                  <div style={{ fontWeight: 600 }}>{editingItem.store_code}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{editingItem.store_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>SKU</div>
                  <div style={{ fontWeight: 600, color: "#818cf8" }}>{editingItem.product_sku}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{editingItem.product_name}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="loaded-version-display">Loaded Version Token</label>
                  <div id="loaded-version-display" style={{ marginTop: "4px" }}>
                    <span className="token" style={{ fontSize: "0.9rem", color: "#38bdf8" }}>
                      Version {editingItem.version}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="current-price-display">Current Price</label>
                  <div id="current-price-display" style={{ marginTop: "4px" }}>
                    <span className="price-text" style={{ fontSize: "1.1rem" }}>
                      ${parseFloat(editingItem.price).toFixed(2)} {editingItem.currency_code}
                    </span>
                  </div>
                </div>
              </div>

              {editingItem.active === false && (
                <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "#f87171", fontSize: "0.82rem" }}>
                  ⚠️ Notice: Store &quot;{editingItem.store_code}&quot; is currently deactivated by the System Administrator. All products of this store are deactivated.
                </div>
              )}

              <div className="input-group">
                <label htmlFor="edit-new-price-input">New Price ({editingItem.currency_code})</label>
                <input
                  id="edit-new-price-input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 259.99"
                  value={editPriceInput}
                  onChange={(e) => setEditPriceInput(e.target.value)}
                  autoFocus
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Must be non-negative with max 2 decimal places.
                </span>
              </div>

              {editError && (
                <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "#f87171", fontSize: "0.82rem" }}>
                  ⚠️ {editError}
                </div>
              )}

              {/* Recent Audit Trail for this record */}
              {editingItem.recent_audits && editingItem.recent_audits.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                    Recent Audit History (Last Changes)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "120px", overflowY: "auto" }}>
                    {editingItem.recent_audits.slice(0, 3).map((a) => (
                      <div key={a.id} style={{ fontSize: "0.75rem", display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: "4px" }}>
                        <span>
                          <strong>{a.action}</strong> by {a.actor_id} ({a.source})
                        </span>
                        <span>
                          {a.before_value?.price ? `$${a.before_value.price} → ` : ""}${a.after_value?.price ? `$${a.after_value.price}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                id="cancel-edit-btn"
                className="btn btn-secondary"
                onClick={handleCloseEdit}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                id="submit-edit-price-btn"
                className="btn btn-primary"
                onClick={handleSavePrice}
                disabled={editLoading}
              >
                {editLoading ? "Validating & Locking..." : "Save Price (v" + editingItem.version + ")"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTTP 409 Concurrency Conflict Modal */}
      {conflictModalData && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "560px", border: "1px solid rgba(217, 70, 239, 0.4)" }}>
            <div className="modal-header" style={{ background: "rgba(217, 70, 239, 0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.5rem" }}>⚠️</span>
                <div>
                  <h3 className="panel-title" style={{ color: "#e879f9" }}>
                    Concurrency Conflict Detected (HTTP 409)
                  </h3>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Optimistic concurrency guard prevented a stale overwrite!
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-body">
              <div className="conflict-box">
                <div className="conflict-header">
                  <span>🚨 The pricing record has been modified concurrently!</span>
                </div>
                <p style={{ fontSize: "0.84rem", color: "var(--text-primary)" }}>
                  Another user or background process saved an update to <strong>{conflictModalData.item.store_code} / {conflictModalData.item.product_sku}</strong> after you loaded version <strong>{conflictModalData.item.version}</strong>.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", background: "rgba(10, 13, 20, 0.4)", padding: "16px", borderRadius: "8px" }}>
                <div style={{ borderRight: "1px solid var(--border-subtle)", paddingRight: "10px" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Your Stale Snapshot
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f87171", marginTop: "4px" }}>
                    Version {conflictModalData.item.version}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Price: ${parseFloat(conflictModalData.item.price).toFixed(2)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Latest Database Record
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#34d399", marginTop: "4px" }}>
                    Version {conflictModalData.conflict.current_version}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#38bdf8", fontWeight: 600 }}>
                    Price: ${parseFloat(conflictModalData.conflict.current_price).toFixed(2)}
                  </div>
                  {conflictModalData.conflict.updated_by && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      by {conflictModalData.conflict.updated_by}
                    </div>
                  )}
                </div>
              </div>

              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                In accordance with enterprise compliance rules, silent overwrites are blocked. Please reload the latest data, review the concurrent changes, and re-submit your update.
              </p>
            </div>

            <div className="modal-footer">
              <button
                id="conflict-dismiss-btn"
                className="btn btn-secondary"
                onClick={() => setConflictModalData(null)}
              >
                Dismiss
              </button>
              <button
                id="conflict-reload-btn"
                className="btn btn-primary"
                onClick={handleReloadAfterConflict}
              >
                🔄 Review & Reload Latest (v{conflictModalData.conflict.current_version})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
