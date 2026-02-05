import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { AlertsPage } from "./pages/AlertsPage";
import { LiveMonitoringPage } from "./pages/LiveMonitoringPage";
import { MessagesPage } from "./pages/MessagesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VisionManagementPage } from "./pages/VisionManagementPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/panel" replace />} />
      <Route path="/panel" element={<DashboardPage />} />
      <Route path="/canli-izleme" element={<LiveMonitoringPage />} />
      <Route path="/vision-yonetimi" element={<VisionManagementPage />} />
      <Route path="/alarmlar" element={<AlertsPage />} />
      <Route path="/mesajlar" element={<MessagesPage />} />
      <Route path="/raporlar" element={<ReportsPage />} />
      <Route path="/ayarlar" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}
