import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { ImportJob } from "../types";

interface DashboardProps {
  onNavigate: (tab: string, jobId?: string) => void;
}

export const DashboardView: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    totalStores: 0,
    totalProducts: 0,
    totalPricing: 0,
    totalJobs: 0,
  });
  const [recentJobs, setRecentJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [stores, products, pricingRes, jobsRes] = await Promise.all([
          api.getStores().catch(() => []),
          api.getProducts().catch(() => []),
          api.getPricing({ limit: 1 }).catch(() => ({ total: 0 })),
          api.getImportJobs({ limit: 5 }).catch(() => ({ items: [], total: 0 })),
        ]);

        setStats({
          totalStores: stores.length,
          totalProducts: products.length,
          totalPricing: pricingRes.total,
          totalJobs: jobsRes.total,
        });
        setRecentJobs(jobsRes.items);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, []);

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "completed") return <span className="badge badge-completed">COMPLETED</span>;
    if (s === "completed_with_errors") return <span className="badge badge-errors">COMPLETED WITH ERRORS</span>;
    if (s === "completed_with_conflicts") return <span className="badge badge-conflicts">COMPLETED WITH CONFLICTS</span>;
    if (s === "awaiting_confirmation") return <span className="badge badge-awaiting">AWAITING CONFIRMATION</span>;
    if (s === "validating") return <span className="badge badge-validating">VALIDATING</span>;
    if (s === "applying") return <span className="badge badge-applying">APPLYING</span>;
    if (s === "failed") return <span className="badge badge-failed">FAILED</span>;
    if (s === "cancelled") return <span className="badge badge-cancelled">CANCELLED</span>;
    return <span className="badge badge-uploaded">{status}</span>;
  };

  return (
    <div className="content-body">
      {/* Metrics Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-header">
            <span>Active Retail Stores</span>
            <span>🏪</span>
          </div>
          <div className="metric-value">{loading ? "..." : stats.totalStores}</div>
          <div className="metric-sub">Across US, UK, Canada & Germany</div>
        </div>

        <div className="metric-card success">
          <div className="metric-header">
            <span>Managed SKUs</span>
            <span>📦</span>
          </div>
          <div className="metric-value">{loading ? "..." : stats.totalProducts}</div>
          <div className="metric-sub">Electronics, Grocery, Home & Apparel</div>
        </div>

        <div className="metric-card warning">
          <div className="metric-header">
            <span>Active Price Points</span>
            <span>🏷️</span>
          </div>
          <div className="metric-value">{loading ? "..." : stats.totalPricing}</div>
          <div className="metric-sub">Unique Store + SKU combinations</div>
        </div>

        <div className="metric-card conflict">
          <div className="metric-header">
            <span>Import Job Feeds</span>
            <span>⚡</span>
          </div>
          <div className="metric-value">{loading ? "..." : stats.totalJobs}</div>
          <div className="metric-sub">Batched CSV ingestions tracked</div>
        </div>
      </div>

      {/* Quick Ingestion & Demo Action Card */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">⚡ Quick Pricing Ingestion & Test Center</div>
            <div className="panel-desc">
              Upload a custom CSV feed or trigger pre-packaged sample test fixtures to verify ingestion, staging, validation, and optimistic concurrency.
            </div>
          </div>
          <button
            id="dash-upload-btn"
            className="btn btn-primary"
            onClick={() => onNavigate("import")}
          >
            <span>+</span> Upload New CSV
          </button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", gap: "16px", flexWrap: "wrap", background: "rgba(10, 13, 20, 0.2)" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <h4 style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
              🟢 1. Valid Feed Verification
            </h4>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
              13 clean pricing updates across international stores. Verifies standard parsing, preview, and batch apply.
            </p>
            <button
              id="dash-quick-valid-btn"
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("import")}
            >
              Go to Feed Ingestion →
            </button>
          </div>

          <div style={{ flex: 1, minWidth: "260px" }}>
            <h4 style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fb923c", marginBottom: "6px" }}>
              🟠 2. Mixed Feed with Business Errors
            </h4>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
              Contains unknown store/SKU, excess decimal precision (3 decimals), negative price, and duplicate keys.
            </p>
            <button
              id="dash-quick-mixed-btn"
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("import")}
            >
              Inspect Validation Rules →
            </button>
          </div>

          <div style={{ flex: 1, minWidth: "260px" }}>
            <h4 style={{ fontSize: "0.88rem", fontWeight: 700, color: "#e879f9", marginBottom: "6px" }}>
              🟣 3. Stale Version Concurrency Test
            </h4>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
              Demonstrates row-level conflict detection when a price is modified after staging preview before apply.
            </p>
            <button
              id="dash-quick-conflict-btn"
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("pricing")}
            >
              Explore Concurrency Editor →
            </button>
          </div>
        </div>
      </div>

      {/* Recent Import Jobs Panel */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Recent Feed Imports</div>
            <div className="panel-desc">Latest asynchronous batch imports and staged review results.</div>
          </div>
          <button
            id="dash-view-all-jobs-btn"
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigate("history")}
          >
            View All History →
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>File Name</th>
                <th>Status</th>
                <th>Total Rows</th>
                <th>Valid / Invalid</th>
                <th>Applied / Conflict</th>
                <th>Created At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "40px 20px" }}>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      No imports processed yet. Upload your first CSV pricing feed!
                    </div>
                  </td>
                </tr>
              ) : (
                recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <span className="token" title={job.id}>
                        {job.id.substring(0, 8)}...
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "#fff" }}>{job.original_filename}</td>
                    <td>{getStatusBadge(job.status)}</td>
                    <td><strong>{job.total_rows}</strong></td>
                    <td>
                      <span style={{ color: "#34d399", fontWeight: 600 }}>{job.valid_rows}</span>
                      {" / "}
                      <span style={{ color: job.invalid_rows > 0 ? "#f87171" : "var(--text-muted)", fontWeight: 600 }}>
                        {job.invalid_rows}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: "#38bdf8", fontWeight: 600 }}>{job.applied_rows}</span>
                      {" / "}
                      <span style={{ color: job.conflicted_rows > 0 ? "#e879f9" : "var(--text-muted)", fontWeight: 600 }}>
                        {job.conflicted_rows}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td>
                      <button
                        id={`job-inspect-${job.id.substring(0, 8)}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => onNavigate("import", job.id)}
                      >
                        Inspect Preview →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
