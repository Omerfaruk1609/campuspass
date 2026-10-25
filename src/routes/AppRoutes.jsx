import { Routes, Route } from "react-router-dom";
import RootLayout from "../layouts/RootLayout";
import HomePage from "../pages/HomePage";
import EventPage from "../pages/EventPage";
import StudentProfile from "../pages/StudentProfile";
import OrganizerDashboardPage from "../pages/OrganizerDashboardPage";
import OrganizerEventAnalyticsPage from "../pages/OrganizerEventAnalyticsPage";
import CommunityDiscoveryPage from "../pages/CommunityDiscoveryPage";
import CommunityProfilePage from "../pages/CommunityProfilePage";
import CommunityManagePage from "../pages/CommunityManagePage";
import CertificateVerificationPage from "../pages/CertificateVerificationPage";
import NotFoundPage from "../pages/NotFoundPage";

import ProtectedRoute from "../components/guards/ProtectedRoute";
import OrganizerGuard from "../components/guards/OrganizerGuard";
import CommunityManageGuard from "../components/guards/CommunityManageGuard";

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
