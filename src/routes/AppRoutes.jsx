import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import RootLayout from "../layouts/RootLayout";

import ProtectedRoute from "../components/guards/ProtectedRoute";
import OrganizerGuard from "../components/guards/OrganizerGuard";
import CommunityManageGuard from "../components/guards/CommunityManageGuard";

// Route-level code splitting with React.lazy
const HomePage = lazy(() => import("../pages/HomePage"));
const EventPage = lazy(() => import("../pages/EventPage"));
const StudentProfile = lazy(() => import("../pages/StudentProfile"));
const OrganizerDashboardPage = lazy(() => import("../pages/OrganizerDashboardPage"));
const OrganizerEventAnalyticsPage = lazy(() => import("../pages/OrganizerEventAnalyticsPage"));
const CommunityDiscoveryPage = lazy(() => import("../pages/CommunityDiscoveryPage"));
const CommunityProfilePage = lazy(() => import("../pages/CommunityProfilePage"));
const CommunityManagePage = lazy(() => import("../pages/CommunityManagePage"));
const CertificateVerificationPage = lazy(() => import("../pages/CertificateVerificationPage"));
const AccountSettingsPage = lazy(() => import("../pages/AccountSettingsPage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        {/* Landing View (Ana Sayfa) */}
        <Route index element={<HomePage viewMode="landing" />} />

        {/* Event Discovery (Etkinlikler) */}
        <Route path="events" element={<HomePage viewMode="discovery" />} />

        {/* Event Detail (Etkinlik Detay & QR & İşlemler) */}
        <Route path="events/:eventId" element={<EventPage />} />

        {/* Community Discovery (Topluluklar) */}
        <Route path="communities" element={<CommunityDiscoveryPage />} />

        {/* Community Profile (Topluluk Sayfası) */}
        <Route path="communities/:slug" element={<CommunityProfilePage />} />

        {/* Community Management (Topluluk Yönetimi — OWNER veya ADMIN) */}
        <Route
          path="communities/:slug/manage"
          element={
            <CommunityManageGuard>
              <CommunityManagePage />
            </CommunityManageGuard>
          }
        />

        {/* Student Profile (Öğrenci Paneli) */}
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <StudentProfile defaultTab="events" />
            </ProtectedRoute>
          }
        />

        {/* Student Certificates (Öğrenci Sertifikaları) */}
        <Route
          path="profile/certificates"
          element={
            <ProtectedRoute>
              <StudentProfile defaultTab="certs" />
            </ProtectedRoute>
          }
        />

        {/* Account & Session Settings (Hesap ve Oturum Ayarları) */}
        <Route
          path="settings"
          element={
            <ProtectedRoute>
              <AccountSettingsPage />
            </ProtectedRoute>
          }
        />

        {/* Organizer Dashboard (Organizatör Paneli) */}
        <Route
          path="organizer"
          element={
            <OrganizerGuard>
              <OrganizerDashboardPage />
            </OrganizerGuard>
          }
        />

        {/* Organizer Event Analytics (Etkinlik Katılımcı Analitiği) */}
        <Route
          path="organizer/events/:eventId"
          element={
            <OrganizerGuard requireEventOrganizer={true}>
              <OrganizerEventAnalyticsPage />
            </OrganizerGuard>
          }
        />

        {/* Certificate Verification (Sertifika Doğrulama) */}
        <Route path="verify" element={<CertificateVerificationPage />} />
        <Route path="verify/:certificateId" element={<CertificateVerificationPage />} />

        {/* 404 — Sayfa Bulunamadı */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
