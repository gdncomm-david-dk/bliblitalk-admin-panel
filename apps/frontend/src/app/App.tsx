import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AdminShell } from "../layouts/AdminShell";
import { DashboardPage } from "../pages/DashboardPage";
import { DevLoginPage } from "../pages/DevLoginPage";
import { UnauthorizedPage } from "../pages/UnauthorizedPage";
import { SiteSettingsPage } from "../pages/settings/SiteSettingsPage";
import { EventsListPage } from "../pages/events/EventsListPage";
import { EventFormPage } from "../pages/events/EventFormPage";
import { EventWorkspacePage } from "../pages/events/EventWorkspacePage";
import { AnalyticsPage } from "../pages/analytics/AnalyticsPage";
import { SpeedDatingSettingsPage } from "../pages/settings/SpeedDatingSettingsPage";
import { FeedbackSettingsPage } from "../pages/settings/FeedbackSettingsPage";
import { CertificateSettingsPage } from "../pages/settings/CertificateSettingsPage";
import { RegistrantsPage } from "../pages/registrants/RegistrantsPage";
import { RolesPage } from "../pages/roles/RolesPage";
import { MarketingEmailPage } from "../pages/marketing/MarketingEmailPage";
import { SpeakersPage } from "../pages/speakers/SpeakersPage";
import { CategoriesPage } from "../pages/categories/CategoriesPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* No /login route: login is a full-page navigation to the gateway's own
            /auth/ui/login, and no SPA route may claim /auth/**. The local stand-in is mounted
            only in DEV, where Vite folds this condition to false and drops it from the
            production bundle. */}
        {import.meta.env.DEV && <Route path="/dev-login" element={<DevLoginPage />} />}
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AdminShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="events" element={<EventsListPage />} />
          <Route path="events/new" element={<EventFormPage />} />
          <Route path="events/:id" element={<EventWorkspacePage />} />
          <Route path="speakers" element={<SpeakersPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="speed-dating-settings" element={<SpeedDatingSettingsPage />} />
          <Route path="feedback-settings" element={<FeedbackSettingsPage />} />
          <Route path="certificate-settings" element={<CertificateSettingsPage />} />
          <Route path="registrants" element={<RegistrantsPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="marketing" element={<MarketingEmailPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SiteSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
