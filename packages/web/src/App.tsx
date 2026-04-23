import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { RequireAuth } from './auth/RequireAuth.js';
import { LoginPage } from './pages/Login.js';
import { DashboardPage } from './pages/Dashboard.js';
import { ProjectsPage } from './pages/Projects.js';
import { ProjectDetailPage } from './pages/ProjectDetail.js';
import { TimesheetPage } from './pages/Timesheet.js';
import { ReportsPage } from './pages/Reports.js';
import { TeamPage } from './pages/Team.js';
import { SettingsPage } from './pages/Settings.js';
import { CalendarPage } from './pages/Calendar.js';
import { ExtensionConnectPage } from './pages/ExtensionConnect.js';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/extension/connect" element={<ExtensionConnectPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/timesheet" element={<TimesheetPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
