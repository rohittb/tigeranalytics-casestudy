import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar, AVAILABLE_USERS } from "./components/Topbar";
import { DashboardView } from "./pages/DashboardView";
import { PricingSearchView } from "./pages/PricingSearchView";
import { ImportUploadView } from "./pages/ImportUploadView";
import { ImportHistoryView } from "./pages/ImportHistoryView";
import { StoreAdminView } from "./pages/StoreAdminView";
import { ArchitectureView } from "./pages/ArchitectureView";
import { UserProfile } from "./types";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);
  const [currentUser, setCurrentUser] = useState<UserProfile>(AVAILABLE_USERS[0]);

  const handleNavigate = (tab: string, jobId?: string) => {
    setSelectedJobId(jobId);
    setCurrentTab(tab);
  };

  const handleSelectUser = (user: UserProfile) => {
    setCurrentUser(user);
    if (user.role !== "admin" && currentTab === "stores") {
      setCurrentTab("dashboard");
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        currentUser={currentUser}
      />

      <div className="main-wrapper">
        <Topbar
          currentTab={currentTab}
          currentUser={currentUser}
          onSelectUser={handleSelectUser}
          onOpenUpload={() => handleNavigate("import")}
        />

        <main>
          {currentTab === "dashboard" && (
            <DashboardView onNavigate={handleNavigate} />
          )}

          {currentTab === "pricing" && (
            <PricingSearchView />
          )}

          {currentTab === "import" && (
            <ImportUploadView
              initialJobId={selectedJobId}
              onNavigateHistory={() => handleNavigate("history")}
            />
          )}

          {currentTab === "history" && (
            <ImportHistoryView
              onSelectJob={(jobId) => handleNavigate("import", jobId)}
            />
          )}

          {currentTab === "stores" && currentUser.role === "admin" && (
            <StoreAdminView currentUser={currentUser} />
          )}

          {currentTab === "architecture" && (
            <ArchitectureView />
          )}
        </main>
      </div>
    </div>
  );
};
