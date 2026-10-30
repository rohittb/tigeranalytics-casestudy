import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { UserProfile } from "../types";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentUser: UserProfile;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  currentUser,
}) => {
  const [health, setHealth] = useState<{ status: string; database: string } | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await api.getHealthReady();
        setHealth(res);
      } catch {
        setHealth({ status: "offline", database: "disconnected" });
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊", adminOnly: false },
    { id: "pricing", label: "Pricing Catalog", icon: "🏷️", adminOnly: false },
    { id: "import", label: "CSV Import Feed", icon: "📥", adminOnly: false },
    { id: "history", label: "Import History", icon: "📜", adminOnly: false },
    { id: "stores", label: "Store Admin", icon: "🏪", adminOnly: true },
    { id: "architecture", label: "Architecture & Spec", icon: "📐", adminOnly: false },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-badge">RP</div>
        <div>
          <div className="brand-title">RetailPricing</div>
          <div className="brand-subtitle">Enterprise POC</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems
          .filter((item) => !item.adminOnly || currentUser.role === "admin")
          .map((item) => {
            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                className={`nav-item ${currentTab === item.id ? "active" : ""}`}
                onClick={() => setCurrentTab(item.id)}
              style={
                item.adminOnly
                  ? {
                      borderColor: currentTab === item.id ? "rgba(168, 85, 247, 0.4)" : "transparent",
                      background: currentTab === item.id ? "rgba(168, 85, 247, 0.15)" : undefined,
                      color: currentTab === item.id ? "#c084fc" : undefined,
                    }
                  : undefined
              }
            >
              <span>{item.icon}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
              {item.adminOnly && (
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "rgba(168, 85, 247, 0.25)",
                    color: "#e879f9",
                    border: "1px solid rgba(168, 85, 247, 0.4)",
                  }}
                >
                  ADMIN
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="system-status-card">
          <span
            className={`status-dot ${health?.database === "healthy" ? "pulsing" : ""}`}
            style={{
              backgroundColor: health?.database === "healthy" ? "#10b981" : "#ef4444",
              boxShadow: `0 0 8px ${health?.database === "healthy" ? "#10b981" : "#ef4444"}`,
            }}
          />
          <div>
            <div style={{ fontWeight: 600, color: "#fff" }}>
              {health?.database === "healthy" ? "Cluster Ready" : "Connecting..."}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              PostgreSQL • Celery Local
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
