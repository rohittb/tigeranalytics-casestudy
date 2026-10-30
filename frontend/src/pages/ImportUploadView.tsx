import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { ImportJob, ImportRow } from "../types";

interface ImportUploadProps {
  initialJobId?: string;
  onNavigateHistory: () => void;
}

export const ImportUploadView: React.FC<ImportUploadProps> = ({
  initialJobId,
  onNavigateHistory,
}) => {
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsPage, setRowsPage] = useState(1);
  const [rowStatusFilter, setRowStatusFilter] = useState<string>("");

  // Selected row IDs for selective execution of error-free rows
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load specific job if provided
  useEffect(() => {
    if (initialJobId) {
      api.getImportJob(initialJobId)
        .then(setActiveJob)
        .catch((err) => console.error("Could not load initial job:", err));
    }
  }, [initialJobId]);

  // Polling for active job status updates when in processing states
  useEffect(() => {
    if (!activeJob) return;
    const isProcessing =
      activeJob.status === "UPLOADED" ||
      activeJob.status === "VALIDATING" ||
      activeJob.status === "APPLYING";

    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const updated = await api.getImportJob(activeJob.id);
        setActiveJob(updated);
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status]);

  // Fetch staged rows for active job
  const loadRows = useCallback(async () => {
    if (!activeJob) return;
    try {
      const res = await api.getImportRows(activeJob.id, {
        status: rowStatusFilter || undefined,
        page: rowsPage,
        limit: 25,
      });
      setRows(res.items);
      setRowsTotal(res.total);
    } catch (e) {
      console.error("Error loading import rows:", e);
    }
  }, [activeJob?.id, rowStatusFilter, rowsPage]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Auto-initialize selectedRowIds with all valid rows when job is AWAITING_CONFIRMATION
  useEffect(() => {
    if (activeJob?.status === "AWAITING_CONFIRMATION") {
      const validIds = rows.filter((r) => r.status === "VALID").map((r) => r.id);
      setSelectedRowIds((prev) => {
        if (prev.size === 0 && validIds.length > 0) {
          return new Set(validIds);
        }
        return prev;
      });
    } else {
      setSelectedRowIds(new Set());
    }
  }, [rows, activeJob?.status]);

  const handleFileUpload = async (file: File) => {
    // Check 10 MB client side
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`File exceeds maximum allowed size of 10 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB uploaded)`);
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);
      setConfirmMessage(null);
      const newJob = await api.uploadCsv(file);
      setActiveJob(newJob);
      setRowsPage(1);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleQuickSampleUpload = async (sampleType: "valid" | "mixed" | "conflict") => {
    let filename = "valid_pricing.csv";
    let csvContent = "";

    if (sampleType === "valid") {
      filename = "valid_pricing.csv";
      csvContent = `store_code,product_sku,country_code,currency_code,price
STR-US-001,SKU-ELEC-1001,US,USD,229.99
STR-US-001,SKU-ELEC-1002,US,USD,379.00
STR-US-001,SKU-HOME-2001,US,USD,285.50
STR-US-001,SKU-APPR-3001,US,USD,175.00
STR-US-001,SKU-GROC-4001,US,USD,21.00
STR-GB-001,SKU-ELEC-1001,GB,GBP,199.99
STR-GB-001,SKU-ELEC-1003,GB,GBP,99.00
STR-GB-001,SKU-HOME-2002,GB,GBP,149.95
STR-GB-001,SKU-GROC-4002,GB,GBP,16.50
STR-CA-001,SKU-ELEC-1004,CA,CAD,89.99
STR-CA-001,SKU-APPR-3002,CA,CAD,95.00
STR-DE-001,SKU-ELEC-1005,DE,EUR,34.90
STR-DE-001,SKU-HOME-2003,DE,EUR,79.99`;
    } else if (sampleType === "mixed") {
      filename = "mixed_valid_invalid.csv";
      csvContent = `store_code,product_sku,country_code,currency_code,price
STR-US-002,SKU-ELEC-1001,US,USD,239.99
UNKNOWN-STORE-999,SKU-ELEC-1002,US,USD,350.00
STR-US-002,UNKNOWN-SKU-999,US,USD,45.00
STR-US-002,SKU-HOME-2001,US,USD,299.999
STR-US-002,SKU-APPR-3001,US,USD,-15.50
,SKU-GROC-4001,US,USD,20.00
STR-US-002,SKU-GROC-4002,US,USD,
STR-US-002,SKU-GROC-4003,US,USD,FREE_PROMO
STR-GB-002,SKU-ELEC-1003,GB,GBP,105.00
STR-GB-002,SKU-ELEC-1003,GB,GBP,110.00
STR-CA-002,SKU-APPR-3003,CA,CAD,72.00`;
    } else {
      filename = "stale_version_conflict.csv";
      csvContent = `store_code,product_sku,country_code,currency_code,price
STR-US-001,SKU-ELEC-1001,US,USD,210.00
STR-US-001,SKU-ELEC-1003,US,USD,109.95`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const file = new File([blob], filename, { type: "text/csv" });
    await handleFileUpload(file);
  };

  const toggleRowSelect = (rowId: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const visibleValidRows = rows.filter((r) => r.status === "VALID");
  const allVisibleValidSelected =
    visibleValidRows.length > 0 && visibleValidRows.every((r) => selectedRowIds.has(r.id));

  const toggleSelectAllVisibleValid = () => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (allVisibleValidSelected) {
        visibleValidRows.forEach((r) => next.delete(r.id));
      } else {
        visibleValidRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const selectAllJobValidRows = async () => {
    if (!activeJob) return;
    try {
      const res = await api.getImportRows(activeJob.id, { status: "VALID", limit: 200 });
      const allValidIds = res.items.map((r) => r.id);
      setSelectedRowIds(new Set(allValidIds));
    } catch (e) {
      console.error("Error selecting all valid rows:", e);
    }
  };

  const clearSelection = () => {
    setSelectedRowIds(new Set());
  };

  const handleConfirmApply = async (rowIdsToApply?: number[]) => {
    if (!activeJob) return;
    try {
      setConfirming(true);
      setUploadError(null);
      const res = await api.confirmImport(activeJob.id, rowIdsToApply);
      setConfirmMessage(res.message);
      const freshJob = await api.getImportJob(activeJob.id);
      setActiveJob(freshJob);
      loadRows();
    } catch (err: any) {
      setUploadError(err.message || "Failed to confirm import");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelImport = async () => {
    if (!activeJob) return;
    try {
      await api.cancelImport(activeJob.id);
      const freshJob = await api.getImportJob(activeJob.id);
      setActiveJob(freshJob);
      loadRows();
    } catch (err: any) {
      setUploadError(err.message || "Failed to cancel import");
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "completed") return <span className="badge badge-completed">COMPLETED</span>;
    if (s === "completed_with_errors") return <span className="badge badge-errors">COMPLETED WITH ERRORS</span>;
    if (s === "completed_with_conflicts") return <span className="badge badge-conflicts">COMPLETED WITH CONFLICTS</span>;
    if (s === "awaiting_confirmation") return <span className="badge badge-awaiting">AWAITING CONFIRMATION</span>;
    if (s === "validating") return <span className="badge badge-validating">VALIDATING...</span>;
    if (s === "applying") return <span className="badge badge-applying">APPLYING BATCHES...</span>;
    if (s === "failed") return <span className="badge badge-failed">FAILED</span>;
    if (s === "cancelled") return <span className="badge badge-cancelled">CANCELLED</span>;
    return <span className="badge badge-uploaded">{status}</span>;
  };

  const totalPages = Math.ceil(rowsTotal / 25) || 1;

  return (
    <div className="content-body">
      {/* Upload Zone & Quick Fixtures */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Feed Upload & Ingestion Pipeline</div>
            <div className="panel-desc">
              Asynchronous CSV ingestion with structural validation, row-level checking, and optimistic staging.
            </div>
          </div>
          <button
            id="view-import-history-btn"
            className="btn btn-secondary btn-sm"
            onClick={onNavigateHistory}
          >
            📜 Import History
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />

          <div
            id="csv-dropzone"
            className={`dropzone ${isDragOver ? "active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="dropzone-icon">📥</div>
            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>
                {uploading ? "Uploading & Staging Feed..." : "Choose or drag & drop a pricing CSV file"}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Format: <code>store_code, product_sku, country_code, currency_code, price</code>
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Limits: <strong>10 MB</strong> max file size • <strong>50,000</strong> data rows • <strong>50</strong> columns max
              </div>
            </div>
          </div>

          {/* Download & Quick Demo Test Samples Section */}
          <div style={{ marginTop: "24px", padding: "18px", background: "rgba(10, 13, 20, 0.4)", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>
                  📁 Sample Feed Files (Download or 1-Click Ingest)
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Download canonical CSV sample feeds to your device or click to ingest and test validation immediately.
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
              {/* Sample 1: Valid Feed */}
              <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#34d399" }}>🟢 valid_pricing.csv</span>
                  <span className="badge badge-completed" style={{ fontSize: "0.65rem" }}>13 Rows</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                  Clean international prices across US, GB, CA, DE stores.
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <a
                    id="download-valid-csv-btn"
                    href="/samples/valid_pricing.csv"
                    download="valid_pricing.csv"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, textDecoration: "none" }}
                  >
                    📥 Download
                  </a>
                  <button
                    id="quick-test-valid-btn"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleQuickSampleUpload("valid")}
                    disabled={uploading}
                    style={{ flex: 1 }}
                  >
                    ⚡ Test Ingest
                  </button>
                </div>
              </div>

              {/* Sample 2: Mixed Feed */}
              <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(249, 115, 22, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#fb923c" }}>🟠 mixed_valid_invalid.csv</span>
                  <span className="badge badge-errors" style={{ fontSize: "0.65rem" }}>11 Rows</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                  Tests unknown store/SKU, excess precision (3 decimals), negative price & duplicate keys.
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <a
                    id="download-mixed-csv-btn"
                    href="/samples/mixed_valid_invalid.csv"
                    download="mixed_valid_invalid.csv"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, textDecoration: "none" }}
                  >
                    📥 Download
                  </a>
                  <button
                    id="quick-test-mixed-btn"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleQuickSampleUpload("mixed")}
                    disabled={uploading}
                    style={{ flex: 1, borderColor: "rgba(249, 115, 22, 0.4)", color: "#fb923c" }}
                  >
                    ⚡ Test Ingest
                  </button>
                </div>
              </div>

              {/* Sample 3: Stale Conflict Feed */}
              <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(217, 70, 239, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#e879f9" }}>🟣 stale_version_conflict.csv</span>
                  <span className="badge badge-conflicts" style={{ fontSize: "0.65rem" }}>2 Rows</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                  Tests row-level conflict detection when price changes before apply.
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <a
                    id="download-conflict-csv-btn"
                    href="/samples/stale_version_conflict.csv"
                    download="stale_version_conflict.csv"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, textDecoration: "none" }}
                  >
                    📥 Download
                  </a>
                  <button
                    id="quick-test-conflict-btn"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleQuickSampleUpload("conflict")}
                    disabled={uploading}
                    style={{ flex: 1, borderColor: "rgba(217, 70, 239, 0.4)", color: "#e879f9" }}
                  >
                    ⚡ Test Ingest
                  </button>
                </div>
              </div>
            </div>
          </div>

          {uploadError && (
            <div style={{ marginTop: "16px", padding: "12px 16px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "8px", color: "#f87171", fontSize: "0.86rem" }}>
              ⚠️ {uploadError}
            </div>
          )}

          {confirmMessage && (
            <div style={{ marginTop: "16px", padding: "12px 16px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: "8px", color: "#34d399", fontSize: "0.86rem" }}>
              ✅ {confirmMessage}
            </div>
          )}
        </div>
      </div>

      {/* Active Job Inspector */}
      {activeJob && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="panel-title">{activeJob.original_filename}</span>
                {getStatusBadge(activeJob.status)}
              </div>
              <div className="panel-desc" style={{ marginTop: "4px" }}>
                Job ID: <code>{activeJob.id}</code> • Ingested by: <strong>{activeJob.created_by}</strong> at {new Date(activeJob.created_at).toLocaleTimeString()}
              </div>
            </div>

            {/* Action Buttons for Job State */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {activeJob.status === "AWAITING_CONFIRMATION" && (
                <>
                  <div style={{ marginRight: "4px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    Selected: <strong style={{ color: selectedRowIds.size > 0 ? "#34d399" : "var(--text-muted)" }}>{selectedRowIds.size}</strong> of {activeJob.valid_rows} error-free rows
                  </div>

                  <button
                    id="cancel-import-btn"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCancelImport}
                    disabled={confirming}
                  >
                    Cancel Import
                  </button>

                  {/* Selective Apply button */}
                  <button
                    id="confirm-selected-btn"
                    className="btn btn-primary"
                    onClick={() => handleConfirmApply(Array.from(selectedRowIds))}
                    disabled={confirming || selectedRowIds.size === 0}
                    style={{
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      borderColor: "#10b981",
                      opacity: selectedRowIds.size === 0 ? 0.5 : 1,
                    }}
                    title={selectedRowIds.size === 0 ? "Select at least 1 error-free row using checkboxes" : `Execute only the ${selectedRowIds.size} selected error-free rows`}
                  >
                    {confirming ? "Queueing Apply..." : `✅ Apply Selected (${selectedRowIds.size} rows)`}
                  </button>

                  {/* Bulk Apply All valid rows button */}
                  <button
                    id="confirm-import-btn"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleConfirmApply(undefined)}
                    disabled={confirming || activeJob.valid_rows === 0}
                    title="Apply all error-free rows across the entire feed"
                  >
                    ⚡ Apply All Error-Free ({activeJob.valid_rows})
                  </button>
                </>
              )}

              {(activeJob.status === "VALIDATING" || activeJob.status === "APPLYING") && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#818cf8", fontSize: "0.84rem" }}>
                  <span className="status-dot pulsing" />
                  Background worker processing batches...
                </div>
              )}
            </div>
          </div>

          {/* Job Counters Bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1px", background: "var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ background: "var(--bg-surface)", padding: "16px 20px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Rows</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fff" }}>{activeJob.total_rows}</div>
            </div>
            <div style={{ background: "var(--bg-surface)", padding: "16px 20px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Valid (Eligible)</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#34d399" }}>{activeJob.valid_rows}</div>
            </div>
            <div style={{ background: "var(--bg-surface)", padding: "16px 20px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Invalid (Errors)</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: activeJob.invalid_rows > 0 ? "#f87171" : "var(--text-muted)" }}>
                {activeJob.invalid_rows}
              </div>
            </div>
            <div style={{ background: "var(--bg-surface)", padding: "16px 20px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Applied</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#38bdf8" }}>{activeJob.applied_rows}</div>
            </div>
            <div style={{ background: "var(--bg-surface)", padding: "16px 20px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Conflicted (Stale)</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: activeJob.conflicted_rows > 0 ? "#e879f9" : "var(--text-muted)" }}>
                {activeJob.conflicted_rows}
              </div>
            </div>
          </div>

          {activeJob.failure_summary && (
            <div style={{ padding: "14px 20px", background: "rgba(239, 68, 68, 0.15)", borderBottom: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", fontSize: "0.85rem" }}>
              <strong>Job Failure Summary:</strong> {activeJob.failure_summary}
            </div>
          )}

          {/* Staged Rows Tabs */}
          <div className="tabs-header">
            <button
              id="filter-tab-all"
              className={`tab-btn ${rowStatusFilter === "" ? "active" : ""}`}
              onClick={() => {
                setRowStatusFilter("");
                setRowsPage(1);
              }}
            >
              All Rows ({activeJob.total_rows})
            </button>
            <button
              id="filter-tab-valid"
              className={`tab-btn ${rowStatusFilter === "VALID" ? "active" : ""}`}
              onClick={() => {
                setRowStatusFilter("VALID");
                setRowsPage(1);
              }}
            >
              🟢 Eligible ({activeJob.valid_rows})
            </button>
            <button
              id="filter-tab-invalid"
              className={`tab-btn ${rowStatusFilter === "INVALID" ? "active" : ""}`}
              onClick={() => {
                setRowStatusFilter("INVALID");
                setRowsPage(1);
              }}
            >
              🔴 Errors ({activeJob.invalid_rows})
            </button>
            <button
              id="filter-tab-applied"
              className={`tab-btn ${rowStatusFilter === "APPLIED" ? "active" : ""}`}
              onClick={() => {
                setRowStatusFilter("APPLIED");
                setRowsPage(1);
              }}
            >
              🔵 Applied ({activeJob.applied_rows})
            </button>
            <button
              id="filter-tab-conflict"
              className={`tab-btn ${rowStatusFilter === "CONFLICT" ? "active" : ""}`}
              onClick={() => {
                setRowStatusFilter("CONFLICT");
                setRowsPage(1);
              }}
            >
              🟣 Conflicts ({activeJob.conflicted_rows})
            </button>
          </div>

          {/* Quick Selection Toolbar when awaiting confirmation */}
          {activeJob.status === "AWAITING_CONFIRMATION" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", background: "rgba(16, 185, 129, 0.08)", borderBottom: "1px solid rgba(16, 185, 129, 0.2)", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", color: "var(--text-primary)" }}>
                <span>☑️</span>
                <span>
                  <strong>Selective Row Execution:</strong> Check any error-free rows you want to apply. Rows with errors cannot be selected.
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  id="select-all-valid-btn"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  onClick={selectAllJobValidRows}
                >
                  ✓ Select All Error-Free
                </button>
                <button
                  type="button"
                  id="deselect-all-btn"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  onClick={clearSelection}
                >
                  ✕ Deselect All
                </button>
              </div>
            </div>
          )}

          {/* Staged Rows Table */}
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {activeJob.status === "AWAITING_CONFIRMATION" && (
                    <th style={{ width: "42px", textAlign: "center" }}>
                      <input
                        id="select-all-visible-checkbox"
                        type="checkbox"
                        title="Toggle all visible error-free rows"
                        checked={allVisibleValidSelected}
                        onChange={toggleSelectAllVisibleValid}
                        style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "#10b981" }}
                      />
                    </th>
                  )}
                  <th>Row #</th>
                  <th>Store Code</th>
                  <th>Product SKU</th>
                  <th>Country / Currency</th>
                  <th>Price</th>
                  <th>Expected Ver</th>
                  <th>Status</th>
                  <th>Validation / Conflict Reasons</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={activeJob.status === "AWAITING_CONFIRMATION" ? 9 : 8} style={{ textAlign: "center", padding: "40px" }}>
                      <div style={{ color: "var(--text-muted)" }}>
                        No rows found matching current tab filter.
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      style={{
                        background: selectedRowIds.has(r.id) ? "rgba(16, 185, 129, 0.05)" : undefined,
                      }}
                    >
                      {activeJob.status === "AWAITING_CONFIRMATION" && (
                        <td style={{ textAlign: "center" }}>
                          {r.status === "VALID" ? (
                            <input
                              id={`select-row-checkbox-${r.id}`}
                              type="checkbox"
                              checked={selectedRowIds.has(r.id)}
                              onChange={() => toggleRowSelect(r.id)}
                              style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "#10b981" }}
                              title="Select row for execution"
                            />
                          ) : (
                            <span
                              title="Row contains validation errors and cannot be executed"
                              style={{ cursor: "not-allowed", opacity: 0.4, fontSize: "0.85rem" }}
                            >
                              🚫
                            </span>
                          )}
                        </td>
                      )}
                      <td><span className="token">#{r.row_number}</span></td>
                      <td><strong>{r.store_code || "—"}</strong></td>
                      <td><span className="token" style={{ color: "#818cf8" }}>{r.product_sku || "—"}</span></td>
                      <td>
                        <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "#fff" }}>
                          {r.country_code || "—"} / {r.currency_code || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="price-text">
                          {r.price !== null ? `$${parseFloat(r.price.toString()).toFixed(2)}` : "—"}
                        </span>
                      </td>
                      <td>
                        {r.expected_version !== null ? (
                          <span className="token" title="Captured during staging">
                            v{r.expected_version}
                          </span>
                        ) : (
                          <span className="badge badge-uploaded" style={{ fontSize: "0.68rem" }}>
                            NEW INSERT
                          </span>
                        )}
                      </td>
                      <td>
                        {r.status === "VALID" && <span className="badge badge-valid">VALID</span>}
                        {r.status === "INVALID" && <span className="badge badge-invalid">INVALID</span>}
                        {r.status === "APPLIED" && <span className="badge badge-applied">APPLIED</span>}
                        {r.status === "CONFLICT" && <span className="badge badge-conflict">CONFLICT</span>}
                        {r.status === "SKIPPED" && <span className="badge badge-cancelled">SKIPPED</span>}
                        {r.status === "PENDING" && <span className="badge badge-uploaded">PENDING</span>}
                      </td>
                      <td>
                        {r.errors && r.errors.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {r.errors.map((err, eIdx) => (
                              <div
                                key={eIdx}
                                style={{
                                  fontSize: "0.78rem",
                                  color: r.status === "CONFLICT" ? "#e879f9" : "#f87171",
                                  background: r.status === "CONFLICT" ? "rgba(217, 70, 239, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  borderLeft: `3px solid ${r.status === "CONFLICT" ? "#d946ef" : "#ef4444"}`,
                                }}
                              >
                                <strong>[{err.code}]</strong> {err.message}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "#34d399" }}>✓ Ready to apply</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Rows Pagination */}
          <div className="pagination-bar">
            <div>
              Showing <strong>{rows.length}</strong> of <strong>{rowsTotal}</strong> rows (Page {rowsPage} of {totalPages})
            </div>
            <div className="pagination-controls">
              <button
                id="rows-page-prev-btn"
                className="btn btn-secondary btn-sm"
                disabled={rowsPage <= 1}
                onClick={() => setRowsPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                id="rows-page-next-btn"
                className="btn btn-secondary btn-sm"
                disabled={rowsPage >= totalPages}
                onClick={() => setRowsPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
