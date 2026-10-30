import React, { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import { ImportJob } from "../types";

interface ImportHistoryProps {
  onSelectJob: (jobId: string) => void;
}

export const ImportHistoryView: React.FC<ImportHistoryProps> = ({ onSelectJob }) => {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getImportJobs({
        status: statusFilter || undefined,
        page,
        limit: 15,
      });
      setJobs(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error("Error loading import history:", e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

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

  const totalPages = Math.ceil(total / 15) || 1;

  return (
    <div className="content-body">
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Feed Ingestion Audit History</div>
            <div className="panel-desc">
              Comprehensive log of all CSV feed imports, terminal statuses, row counts, and partial application records.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <label htmlFor="history-status-select" style={{ margin: 0 }}>Filter Status:</label>
            <select
              id="history-status-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Terminal & Active States</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="COMPLETED_WITH_ERRORS">COMPLETED_WITH_ERRORS</option>
              <option value="COMPLETED_WITH_CONFLICTS">COMPLETED_WITH_CONFLICTS</option>
              <option value="AWAITING_CONFIRMATION">AWAITING_CONFIRMATION</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>File Name</th>
                <th>Status</th>
                <th>Total Rows</th>
                <th>Valid / Errors</th>
                <th>Applied / Conflicts</th>
                <th>Created By</th>
                <th>Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "40px" }}>
                    Loading import history...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "40px" }}>
                    <div style={{ color: "var(--text-muted)" }}>
                      No import jobs found matching current filter.
                    </div>
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
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
                    <td style={{ fontSize: "0.82rem" }}>{job.created_by}</td>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td>
                      <button
                        id={`history-inspect-btn-${job.id.substring(0, 8)}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectJob(job.id)}
                      >
                        Inspect Rows →
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
            Showing <strong>{jobs.length}</strong> of <strong>{total}</strong> jobs (Page {page} of {totalPages})
          </div>
          <div className="pagination-controls">
            <button
              id="history-page-prev-btn"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              id="history-page-next-btn"
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
