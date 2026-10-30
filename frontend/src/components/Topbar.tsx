import React, { useState, useRef, useEffect } from "react";
import { UserProfile } from "../types";

export const AVAILABLE_USERS: UserProfile[] = [
  {
    id: "dev-analyst-01",
    name: "Pricing Analyst",
    role: "analyst",
    roleLabel: "Store Operations",
    avatar: "DA",
  },
  {
    id: "admin-ops-01",
    name: "System Administrator",
    role: "admin",
    roleLabel: "System Admin",
    avatar: "SA",
  },
];

interface TopbarProps {
  currentTab: string;
  currentUser: UserProfile;
  onSelectUser: (user: UserProfile) => void;
  onOpenUpload: () => void;
}

const TAB_TITLES: Record<string, string> = {
  dashboard: "Operations Dashboard",
  pricing: "Pricing Catalog & Concurrency Manager",
  import: "CSV Feed Ingestion & Staging",
  history: "Import History & Row Audits",
  stores: "Store Administration & Configs",
  architecture: "Architecture Diagrams & Specification",
};

export const Topbar: React.FC<TopbarProps> = ({
  currentTab,
  currentUser,
  onSelectUser,
  onOpenUpload,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="topbar">
      <h1 className="page-title">{TAB_TITLES[currentTab] || "Retail Pricing Management"}</h1>

      <div className="topbar-actions">
        {currentTab !== "import" && (
          <button
            id="topbar-upload-cta-btn"
            className="btn btn-primary btn-sm"
            onClick={onOpenUpload}
          >
            <span>+</span> Upload Feed CSV
          </button>
        )}

        {/* User Switcher Dropdown */}
        <div style={{ position: "relative" }} ref={dropdownRef}>
          <button
            id="user-switcher-dropdown-btn"
            className="user-pill"
            style={{
              cursor: "pointer",
              background: currentUser.role === "admin" ? "rgba(168, 85, 247, 0.15)" : "var(--bg-surface-elevated)",
              borderColor: currentUser.role === "admin" ? "rgba(168, 85, 247, 0.4)" : "var(--border-subtle)",
            }}
            onClick={() => setDropdownOpen((prev) => !prev)}
          >
            <div
              className="user-avatar"
              style={{
                background: currentUser.role === "admin" ? "#a855f7" : "#3b82f6",
              }}
            >
              {currentUser.avatar}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
                {currentUser.id}
              </div>
              <div style={{ fontSize: "0.68rem", color: currentUser.role === "admin" ? "#c084fc" : "var(--text-muted)" }}>
                {currentUser.roleLabel}
              </div>
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "4px" }}>▼</span>
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                width: "260px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                boxShadow: "var(--shadow-lg)",
                padding: "8px",
                zIndex: 100,
                animation: "fadeIn 0.15s ease-out",
              }}
            >
              <div style={{ padding: "8px 10px 6px", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                Switch Persona / Role
              </div>

              {AVAILABLE_USERS.map((u) => {
                const isSelected = u.id === currentUser.id;
                return (
                  <button
                    key={u.id}
                    id={`switch-user-${u.id}`}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: isSelected ? "rgba(99, 102, 241, 0.12)" : "transparent",
                      border: "none",
                      color: isSelected ? "#818cf8" : "var(--text-primary)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "var(--transition)",
                    }}
                    onClick={() => {
                      onSelectUser(u);
                      setDropdownOpen(false);
                    }}
                  >
                    <div
                      className="user-avatar"
                      style={{
                        background: u.role === "admin" ? "#a855f7" : "#3b82f6",
                      }}
                    >
                      {u.avatar}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {u.id} • {u.roleLabel}
                      </div>
                    </div>
                    {isSelected && <span style={{ color: "#818cf8", fontSize: "0.9rem" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
