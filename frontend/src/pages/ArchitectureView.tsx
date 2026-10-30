import React, { useState } from "react";

export const ArchitectureView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"arch" | "context" | "decisions" | "cloud">("arch");

  return (
    <div className="content-body">
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">System Architecture & Design Decisions</div>
            <div className="panel-desc">
              Complete technical specification, diagrams, and architectural rationale for the 3,000-store Retail Pricing Management System.
            </div>
          </div>
        </div>

        <div className="tabs-header">
          <button
            id="tab-btn-arch"
            className={`tab-btn ${activeTab === "arch" ? "active" : ""}`}
            onClick={() => setActiveTab("arch")}
          >
            🏛️ Production Architecture
          </button>
          <button
            id="tab-btn-context"
            className={`tab-btn ${activeTab === "context" ? "active" : ""}`}
            onClick={() => setActiveTab("context")}
          >
            🌐 System Context Diagram
          </button>
          <button
            id="tab-btn-decisions"
            className={`tab-btn ${activeTab === "decisions" ? "active" : ""}`}
            onClick={() => setActiveTab("decisions")}
          >
            📋 Design Decisions & NFR Matrix
          </button>
          <button
            id="tab-btn-cloud"
            className={`tab-btn ${activeTab === "cloud" ? "active" : ""}`}
            onClick={() => setActiveTab("cloud")}
          >
            ☁️ Future Production Mapping
          </button>
        </div>

        <div style={{ padding: "28px" }}>
          {activeTab === "arch" && (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                  Retail Pricing Management System – Production Architecture
                </h3>
                <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                  High-availability cloud architecture featuring decoupled ingestion via SQS/Celery, atomic PostgreSQL versioning, and comprehensive OpenTelemetry distributed tracing.
                </p>
              </div>

              <div style={{ background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", textAlign: "center", marginBottom: "24px" }}>
                <img
                  src="/architecture-diagram.png"
                  alt="Production Architecture Diagram"
                  style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                <div style={{ background: "var(--bg-surface)", padding: "18px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  <h4 style={{ color: "#818cf8", fontSize: "0.92rem", fontWeight: 700, marginBottom: "8px" }}>
                    🚀 API & Compute Layer
                  </h4>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    FastAPI REST containers running on ECS Fargate behind an Application Load Balancer and AWS WAF. Handles instant validation and paginated queries.
                  </p>
                </div>

                <div style={{ background: "var(--bg-surface)", padding: "18px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  <h4 style={{ color: "#34d399", fontSize: "0.92rem", fontWeight: 700, marginBottom: "8px" }}>
                    ⚙️ Asynchronous Batch Worker
                  </h4>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    Celery worker workers consume tasks from Redis/SQS. Executes chunked 1,000-row batch writes to guarantee predictable latency and prevent connection starvation.
                  </p>
                </div>

                <div style={{ background: "var(--bg-surface)", padding: "18px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  <h4 style={{ color: "#38bdf8", fontSize: "0.92rem", fontWeight: 700, marginBottom: "8px" }}>
                    🔒 Durable Data Tier
                  </h4>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    PostgreSQL 16 as the authoritative source of truth. Enforces composite uniqueness, non-negative CHECK constraints, and optimistic version locking.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "context" && (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                  System Context Diagram
                </h3>
                <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                  Interaction boundaries between Store Operations users, Regional/HQ teams, System Administrators, and the Central Pricing System.
                </p>
              </div>

              <div style={{ background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", textAlign: "center", marginBottom: "24px" }}>
                <img
                  src="/context-diagram.png"
                  alt="Context Diagram"
                  style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ background: "var(--bg-surface)", padding: "18px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  <h4 style={{ color: "#34d399", fontSize: "0.92rem", fontWeight: 700, marginBottom: "8px" }}>
                    👤 Store Operations User (Regional / HQ)
                  </h4>
                  <ul style={{ fontSize: "0.82rem", color: "var(--text-secondary)", paddingLeft: "18px", lineHeight: "1.8" }}>
                    <li>Uploads store pricing feed CSV files (up to 10 MB / 50k rows).</li>
                    <li>Reviews staged validation errors, duplicates, and expected version previews.</li>
                    <li>Explicitly confirms and executes partial application of eligible rows.</li>
                    <li>Searches pricing and updates records via optimistic concurrency.</li>
                  </ul>
                </div>

                <div style={{ background: "var(--bg-surface)", padding: "18px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  <h4 style={{ color: "#818cf8", fontSize: "0.92rem", fontWeight: 700, marginBottom: "8px" }}>
                    🛡️ System Administrator & Compliance
                  </h4>
                  <ul style={{ fontSize: "0.82rem", color: "var(--text-secondary)", paddingLeft: "18px", lineHeight: "1.8" }}>
                    <li>Audits full chronological price adjustments across manual and import sources.</li>
                    <li>Monitors cluster health (PostgreSQL connectivity, Celery queues, storage).</li>
                    <li>Manages store mappings, product catalogues, and security configurations.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "decisions" && (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                  Non-Functional Requirements (NFR) & Architectural Decisions Matrix
                </h3>
                <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                  How the system architecture addresses the real-world operational challenges of a 3,000-store international retail chain.
                </p>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "22%" }}>NFR / Challenge</th>
                      <th style={{ width: "35%" }}>Architectural Solution</th>
                      <th style={{ width: "43%" }}>Implementation Detail in POC</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong style={{ color: "#38bdf8" }}>Scale (3,000 Stores)</strong></td>
                      <td>Asynchronous task ingestion and chunked batch writes. Never blocks API request threads.</td>
                      <td>FastAPI writes file to local storage, enqueues Celery task. Worker processes rows in batches of up to 1,000 rows.</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: "#e879f9" }}>Concurrency & Race Conditions</strong></td>
                      <td>Optimistic Concurrency Control (OCC) using atomic version tokens. No silent overwrites.</td>
                      <td><code>UPDATE store_pricing SET version = version + 1 WHERE version = :expected_version</code>. Stale updates return HTTP 409 Conflict.</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: "#fb923c" }}>Partial Apply Policy</strong></td>
                      <td>Valid rows apply after explicit user preview; invalid rows remain unapplied with actionable errors.</td>
                      <td>Pre-checks stores/SKUs, precision, negative prices, and duplicate business keys. Job reaches <code>COMPLETED_WITH_ERRORS</code>.</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: "#34d399" }}>Idempotency & Retries</strong></td>
                      <td>Task delivery retries must never double-apply or duplicate prices.</td>
                      <td>Row outcomes tracked in <code>import_rows</code> with <code>applied_at</code> timestamp. Already applied rows are skipped on re-run.</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: "#f87171" }}>Guardrails & Limits</strong></td>
                      <td>Defend against oversized payloads and memory exhaustion.</td>
                      <td>10 MB max file size, 50,000 max rows, 50 max columns enforced server-side. Decimal precision checked (NUMERIC(12,2)).</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: "#818cf8" }}>Auditability</strong></td>
                      <td>Every price change must be auditable with actor, timestamp, before/after snapshots.</td>
                      <td>Durable <code>audit_events</code> table logs all manual PATCH updates and import batch updates with job correlation IDs.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "cloud" && (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                  Future Production Cloud Mapping (AWS)
                </h3>
                <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                  Clear modular separation ensures the local POC code easily maps to enterprise AWS managed services without architectural rewrite.
                </p>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Local POC Component</th>
                      <th>Production AWS Equivalent</th>
                      <th>Operational Purpose & SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>React + Vite Static Build</td>
                      <td>Amazon S3 + CloudFront (OAC) + Route 53</td>
                      <td>Global low-latency edge delivery, DDoS protection via AWS Shield/WAF.</td>
                    </tr>
                    <tr>
                      <td>FastAPI API Container</td>
                      <td>Amazon ECS Fargate + Application Load Balancer</td>
                      <td>Serverless container autoscaling with zero EC2 management and zero downtime rollouts.</td>
                    </tr>
                    <tr>
                      <td>Celery Worker + Redis Broker</td>
                      <td>Amazon ECS Fargate Worker + Amazon SQS + DLQ</td>
                      <td>Enterprise message durability, automatic dead-letter queueing for poisoned messages.</td>
                    </tr>
                    <tr>
                      <td>Local Upload Volume</td>
                      <td>Amazon S3 Private Bucket + Presigned URLs</td>
                      <td>Secure multi-part uploads with KMS server-side encryption and lifecycle policies.</td>
                    </tr>
                    <tr>
                      <td>Docker Compose PostgreSQL</td>
                      <td>Amazon RDS for PostgreSQL (Multi-AZ)</td>
                      <td>Automated failover, point-in-time recovery (PITR), Read Replicas for reporting queries.</td>
                    </tr>
                    <tr>
                      <td>Local Logging & Health Probes</td>
                      <td>OpenTelemetry + CloudWatch + AWS X-Ray</td>
                      <td>End-to-end distributed tracing, real-time alert thresholds, and CloudTrail auditing.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
