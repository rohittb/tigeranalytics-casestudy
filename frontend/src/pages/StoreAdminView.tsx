import React, { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import { Store, UserProfile } from "../types";

interface StoreAdminProps {
  currentUser: UserProfile;
}

export const StoreAdminView: React.FC<StoreAdminProps> = ({ currentUser }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add Store Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStoreCode, setNewStoreCode] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [newCountryCode, setNewCountryCode] = useState("US");
  const [newActive, setNewActive] = useState(true);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Deactivate Confirmation Modal State
  const [deactivateTarget, setDeactivateTarget] = useState<Store | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // Edit / Config Modal State
  const [configTarget, setConfigTarget] = useState<Store | null>(null);
  const [configName, setConfigName] = useState("");
  const [configCountry, setConfigCountry] = useState("US");
  const [configLoading, setConfigLoading] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getStores(true);
      setStores(data);
    } catch (e: any) {
      console.error("Failed to load stores:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreCode.trim() || !newStoreName.trim()) {
      setAddError("Store Code and Name are required");
      return;
    }

    try {
      setAddLoading(true);
      setAddError(null);
      await api.createStore(
        {
          store_code: newStoreCode.trim().toUpperCase(),
          name: newStoreName.trim(),
          country_code: newCountryCode.trim().toUpperCase(),
          active: newActive,
        },
        currentUser.id
      );

      setStatusMessage({
        type: "success",
        text: `Store '${newStoreCode.toUpperCase()}' was created successfully!`,
      });
      setAddModalOpen(false);
      setNewStoreCode("");
      setNewStoreName("");
      loadStores();
    } catch (err: any) {
      setAddError(err.message || "Failed to create store");
    } finally {
      setAddLoading(false);
    }
  };

  const handleToggleActive = async (store: Store) => {
    if (store.active) {
      // Opening confirmation modal for deactivation
      setDeactivateTarget(store);
    } else {
      // Direct reactivation
      try {
        setLoading(true);
        await api.updateStore(store.id, { active: true }, currentUser.id);
        setStatusMessage({
          type: "success",
          text: `Store '${store.store_code}' and its product pricing records have been reactivated!`,
        });
        loadStores();
      } catch (err: any) {
        setStatusMessage({
          type: "error",
          text: err.message || "Failed to reactivate store",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      setDeactivateLoading(true);
      await api.updateStore(deactivateTarget.id, { active: false }, currentUser.id);
      setStatusMessage({
        type: "success",
        text: `Store '${deactivateTarget.store_code}' was deactivated. All associated product pricing records are now deactivated.`,
      });
      setDeactivateTarget(null);
      loadStores();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to deactivate store",
      });
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configTarget) return;
    try {
      setConfigLoading(true);
      await api.updateStore(
        configTarget.id,
        { name: configName.trim(), country_code: configCountry.trim().toUpperCase() },
        currentUser.id
      );
      setStatusMessage({
        type: "success",
        text: `Configuration for '${configTarget.store_code}' updated successfully!`,
      });
      setConfigTarget(null);
      loadStores();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to update configuration",
      });
    } finally {
      setConfigLoading(false);
    }
  };

  const activeCount = stores.filter((s) => s.active).length;
  const inactiveCount = stores.filter((s) => !s.active).length;
  const totalPricing = stores.reduce((acc, s) => acc + (s.pricing_count || 0), 0);

  return (
    <div className="content-body">
      {/* Admin Notice if not admin */}
      {currentUser.role !== "admin" && (
        <div style={{ padding: "14px 20px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.4)", borderRadius: "8px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px", color: "#fbbf24" }}>
          <span>⚠️</span>
          <div style={{ fontSize: "0.86rem" }}>
            You are currently viewing as <strong>{currentUser.name} ({currentUser.id})</strong>. Switch to <strong>System Administrator</strong> in the topbar to make configuration changes or toggle active status.
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "0.88rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: statusMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${statusMessage.type === "success" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
            color: statusMessage.type === "success" ? "#34d399" : "#f87171",
          }}
        >
          <span>{statusMessage.type === "success" ? "✅" : "⚠️"} {statusMessage.text}</span>
          <button
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem" }}
            onClick={() => setStatusMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-header">
            <span>Total Registered Stores</span>
            <span>🏪</span>
          </div>
          <div className="metric-value">{stores.length}</div>
          <div className="metric-sub">Across international jurisdictions</div>
        </div>

        <div className="metric-card success">
          <div className="metric-header">
            <span>Active Operational Stores</span>
            <span>🟢</span>
          </div>
          <div className="metric-value">{activeCount}</div>
          <div className="metric-sub">Accepting live pricing feeds</div>
        </div>

        <div className="metric-card danger">
          <div className="metric-header">
            <span>Deactivated Stores</span>
            <span>🔴</span>
          </div>
          <div className="metric-value">{inactiveCount}</div>
          <div className="metric-sub">Store products offline & feeds blocked</div>
        </div>

        <div className="metric-card conflict">
          <div className="metric-header">
            <span>Associated Price Points</span>
            <span>🏷️</span>
          </div>
          <div className="metric-value">{totalPricing}</div>
          <div className="metric-sub">Total product SKU prices mapped</div>
        </div>
      </div>

      {/* Stores List Panel */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Retail Store Registry & Lifecycle Configurations</div>
            <div className="panel-desc">
              Manage store entities and operational status. Deactivating a store automatically deactivates all of its product pricing records.
            </div>
          </div>
          <button
            id="add-store-btn"
            className="btn btn-primary"
            onClick={() => {
              setAddError(null);
              setAddModalOpen(true);
            }}
          >
            <span>+</span> Add New Store
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Store Code</th>
                <th>Store Name</th>
                <th>Country</th>
                <th>Associated Products</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>
                    Loading retail store registry...
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>
                    No stores registered yet. Click &apos;+ Add New Store&apos; to register one.
                  </td>
                </tr>
              ) : (
                stores.map((s) => (
                  <tr
                    key={s.id}
                    style={{
                      opacity: s.active ? 1 : 0.75,
                      background: !s.active ? "rgba(239, 68, 68, 0.03)" : undefined,
                    }}
                  >
                    <td>
                      <span className="token" style={{ fontWeight: 700, color: s.active ? "#818cf8" : "var(--text-muted)" }}>
                        {s.store_code}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: s.active ? "#fff" : "var(--text-secondary)" }}>
                        {s.name}
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "#fff" }}>
                        {s.country_code}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: s.active ? "#38bdf8" : "var(--text-muted)" }}>
                        {s.pricing_count || 0} Price Points
                      </span>
                      {!s.active && (
                        <div style={{ fontSize: "0.72rem", color: "#f87171" }}>
                          (All Deactivated)
                        </div>
                      )}
                    </td>
                    <td>
                      {s.active ? (
                        <span className="badge badge-completed">
                          <span className="status-dot" style={{ width: "6px", height: "6px" }} />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="badge badge-failed">
                          🔴 DEACTIVATED
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          id={`toggle-store-${s.store_code}`}
                          className={`btn btn-sm ${s.active ? "btn-danger" : "btn-success"}`}
                          onClick={() => handleToggleActive(s)}
                        >
                          {s.active ? "Deactivate Store" : "Reactivate Store"}
                        </button>
                        <button
                          id={`config-store-${s.store_code}`}
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setConfigTarget(s);
                            setConfigName(s.name);
                            setConfigCountry(s.country_code);
                          }}
                        >
                          ⚙️ Config
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Store Modal */}
      {addModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 className="panel-title">Add New Store Registry</h3>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Register a physical store outlet to enable localized pricing and feeds
                </div>
              </div>
              <button
                id="close-add-modal-btn"
                className="btn btn-secondary btn-sm"
                onClick={() => setAddModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStore}>
              <div className="modal-body">
                <div className="input-group">
                  <label htmlFor="new-store-code-input">Store Code *</label>
                  <input
                    id="new-store-code-input"
                    type="text"
                    placeholder="e.g. STR-US-005"
                    value={newStoreCode}
                    onChange={(e) => setNewStoreCode(e.target.value.toUpperCase())}
                    required
                    autoFocus
                  />
                  <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                    Unique identifier used across CSV feeds and point-of-sale systems.
                  </span>
                </div>

                <div className="input-group">
                  <label htmlFor="new-store-name-input">Store Display Name *</label>
                  <input
                    id="new-store-name-input"
                    type="text"
                    placeholder="e.g. Boston Back Bay Outlet"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="new-store-country-select">Country Code *</label>
                  <select
                    id="new-store-country-select"
                    value={newCountryCode}
                    onChange={(e) => setNewCountryCode(e.target.value)}
                  >
                    <option value="US">US - United States (USD)</option>
                    <option value="GB">GB - United Kingdom (GBP)</option>
                    <option value="CA">CA - Canada (CAD)</option>
                    <option value="DE">DE - Germany (EUR)</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                  <input
                    id="new-store-active-checkbox"
                    type="checkbox"
                    checked={newActive}
                    onChange={(e) => setNewActive(e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <label htmlFor="new-store-active-checkbox" style={{ textTransform: "none", cursor: "pointer", fontSize: "0.86rem" }}>
                    Immediately mark store as <strong>Active</strong> (allow pricing feeds)
                  </label>
                </div>

                {addError && (
                  <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "6px", color: "#f87171", fontSize: "0.82rem" }}>
                    ⚠️ {addError}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  id="cancel-add-store-btn"
                  className="btn btn-secondary"
                  onClick={() => setAddModalOpen(false)}
                  disabled={addLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-add-store-btn"
                  className="btn btn-primary"
                  disabled={addLoading}
                >
                  {addLoading ? "Creating..." : "Save Store"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Store Cascading Warning Modal */}
      {deactivateTarget && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "540px", border: "1px solid rgba(239, 68, 68, 0.4)" }}>
            <div className="modal-header" style={{ background: "rgba(239, 68, 68, 0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.5rem" }}>⚠️</span>
                <div>
                  <h3 className="panel-title" style={{ color: "#f87171" }}>
                    Confirm Store Deactivation
                  </h3>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Rule: All product prices for this store will also be deactivated
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-body">
              <div className="conflict-box" style={{ background: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.92rem" }}>
                  Hierarchical State Deactivation (O(1) Scale-Optimized)
                </div>
                <p style={{ fontSize: "0.84rem", color: "var(--text-primary)" }}>
                  You are about to deactivate <strong>{deactivateTarget.store_code} ({deactivateTarget.name})</strong>.
                </p>
              </div>

              <div style={{ padding: "14px", background: "rgba(10, 13, 20, 0.4)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: "0.82rem", color: "#f87171", fontWeight: 600, marginBottom: "6px" }}>
                  🚨 Operational Consequences:
                </div>
                <ul style={{ fontSize: "0.8rem", color: "var(--text-secondary)", paddingLeft: "18px", lineHeight: "1.7" }}>
                  <li>
                    All <strong>{deactivateTarget.pricing_count || 0} product pricing records</strong> for this store automatically inherit <code>active = false</code> status across catalog search, feeds, and downstream POS.
                  </li>
                  <li>
                    <strong>Zero-Lock O(1) Execution</strong>: Scales seamlessly across 50,000+ SKUs with zero row locks or table bloat.
                  </li>
                  <li>
                    Subsequent CSV pricing feeds targeting store <code>{deactivateTarget.store_code}</code> will be rejected during validation.
                  </li>
                  <li>
                    Reactivating this store instantly restores active status for all associated product prices.
                  </li>
                </ul>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                id="cancel-deactivate-btn"
                className="btn btn-secondary"
                onClick={() => setDeactivateTarget(null)}
                disabled={deactivateLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-deactivate-btn"
                className="btn btn-danger"
                onClick={handleConfirmDeactivate}
                disabled={deactivateLoading}
              >
                {deactivateLoading ? "Deactivating Store & Products..." : "Yes, Deactivate Store & All Products"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure Store Modal */}
      {configTarget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 className="panel-title">Configure Store: {configTarget.store_code}</h3>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Update store operational details
                </div>
              </div>
              <button
                id="close-config-modal-btn"
                className="btn btn-secondary btn-sm"
                onClick={() => setConfigTarget(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig}>
              <div className="modal-body">
                <div className="input-group">
                  <label htmlFor="config-store-code-display">Store Code (Read-Only)</label>
                  <input
                    id="config-store-code-display"
                    type="text"
                    value={configTarget.store_code}
                    disabled
                    style={{ opacity: 0.6 }}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="config-store-name-input">Store Name</label>
                  <input
                    id="config-store-name-input"
                    type="text"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="config-store-country-select">Country Code</label>
                  <select
                    id="config-store-country-select"
                    value={configCountry}
                    onChange={(e) => setConfigCountry(e.target.value)}
                  >
                    <option value="US">US - United States</option>
                    <option value="GB">GB - United Kingdom</option>
                    <option value="CA">CA - Canada</option>
                    <option value="DE">DE - Germany</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  id="cancel-config-btn"
                  className="btn btn-secondary"
                  onClick={() => setConfigTarget(null)}
                  disabled={configLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="save-config-btn"
                  className="btn btn-primary"
                  disabled={configLoading}
                >
                  {configLoading ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
