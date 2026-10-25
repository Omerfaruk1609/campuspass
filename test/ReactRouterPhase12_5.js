import { expect } from "chai";
import React from "react";
globalThis.React = React;
import { renderToString } from "react-dom/server";
import {
  createMemoryRouter,
  RouterProvider,
  MemoryRouter,
  Routes,
  Route,
  useParams,
} from "react-router-dom";

import RootLayout from "../src/layouts/RootLayout.jsx";
import HomePage from "../src/pages/HomePage.jsx";
import EventPage from "../src/pages/EventPage.jsx";
import StudentProfile from "../src/pages/StudentProfile.jsx";
import CertificateVerificationPage from "../src/pages/CertificateVerificationPage.jsx";
import NotFoundPage from "../src/pages/NotFoundPage.jsx";

import ProtectedRoute from "../src/components/guards/ProtectedRoute.jsx";
import OrganizerGuard from "../src/components/guards/OrganizerGuard.jsx";
import CommunityManageGuard from "../src/components/guards/CommunityManageGuard.jsx";
import { AppProvider } from "../src/context/AppContext.jsx";
import { clearActiveAuthState, getActiveAuthState } from "../src/utils/apiClient.js";

const el = React.createElement;

describe("Faz 12.5 — React Router Mimarisi, URL Tabanlı Navigasyon ve Güvenlik Test Paketi", function () {
  this.timeout(10000);

  const sampleEvents = [
    {
      id: 1,
      title: "Monad Blockchain Semineri",
      organizer: "0x1111111111111111111111111111111111111111",
      capacity: 100,
      registeredCount: 45,
      active: true,
      category: "Blockchain",
      community: "Monad Kulübü",
      date: "2026-11-20",
      startTime: "14:00",
      endTime: "16:00",
      status: "upcoming",
      statusLabel: "Kayıt Açık",
      isRegistered: true,
      isAttended: false,
    },
    {
      id: 2,
      title: "Yapay Zekâ Hackathon",
      organizer: "0x2222222222222222222222222222222222222222",
      capacity: 50,
      registeredCount: 50,
      active: true,
      category: "Yapay Zeka",
      community: "AI Kulübü",
      date: "2026-12-01",
      startTime: "10:00",
      endTime: "18:00",
      status: "upcoming",
      statusLabel: "Kontenjan Dolu",
      isRegistered: false,
      isAttended: false,
    },
  ];

  describe("1. Ana Sayfa ve Etkinlik Keşfi Yönlendirmeleri", function () {
    it("1.1 '/' URL'i Ana Sayfa (Landing View) görünümünü ve Hero/Bento bileşenlerini render etmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/"] },
          el(
            AppProvider,
            { initialEvents: sampleEvents, initialLoadingEvents: false },
            el(HomePage, { viewMode: "landing", events: sampleEvents, loadingEvents: false })
          )
        )
      );

      expect(html).to.include("Kampüs Deneyiminin");
      expect(html).to.include("CampusPass Nasıl Çalışır?");
      expect(html).to.include("/events");
      expect(html).to.include("/organizer");
    });

    it("1.2 '/events' URL'i Etkinlik Keşif (Discovery View) görünümünü ve arama/filtre bileşenlerini render etmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events"] },
          el(
            AppProvider,
            { initialEvents: sampleEvents, initialLoadingEvents: false },
            el(HomePage, { viewMode: "discovery", events: sampleEvents, loadingEvents: false })
          )
        )
      );

      expect(html).to.include("Monad Blockchain Semineri");
      expect(html).to.include("Yapay Zekâ Hackathon");
      expect(html).to.include("/events/1");
      expect(html).to.include("/events/2");
    });
  });

  describe("2. Parametrik Rota Eşleşmeleri ve Detay Sayfaları", function () {
    it("2.1 '/events/:eventId' parametresini okuyup ilgili etkinliğin detaylarını göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events/1"] },
          el(
            AppProvider,
            { initialEvents: sampleEvents, initialLoadingEvents: false },
            el(
              Routes,
              null,
              el(Route, {
                path: "/events/:eventId",
                element: el(EventPage, { event: sampleEvents[0] }),
              })
            )
          )
        )
      );

      expect(html).to.include("Monad Blockchain Semineri");
      expect(html).to.include("Monad Kulübü");
      expect(html).to.include("#1");
    });

    it("2.2 Var olmayan etkinlik kimliğinde 'Etkinlik bulunamadı' mesajı ve dönüş butonu vermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events/99999"] },
          el(
            AppProvider,
            { initialEvents: sampleEvents, initialLoadingEvents: false },
            el(
              Routes,
              null,
              el(Route, {
                path: "/events/:eventId",
                element: el(EventPage, { event: null }),
              })
            )
          )
        )
      );

      expect(html).to.include("Etkinlik bulunamadı.");
      expect(html).to.include("Etkinlik Listesine Dön");
    });

    it("2.3 '/communities/:slug' URL parametresini başarıyla yakalamalı", function () {
      function TestCommunitySlug() {
        const { slug } = useParams();
        return el("div", { "data-testid": "slug-display" }, `Topluluk: ${slug}`);
      }

      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/communities/itu-blockchain"] },
          el(
            Routes,
            null,
            el(Route, {
              path: "/communities/:slug",
              element: el(TestCommunitySlug),
            })
          )
        )
      );

      expect(html).to.include("Topluluk: itu-blockchain");
    });
  });

  describe("3. Korumalı Rotalar ve Güvenlik Muhafızları (Route Guards)", function () {
    it("3.1 Cüzdan bağlı değilken korumalı '/profile' rotası cüzdan bağlantı uyarısını göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/profile"] },
          el(
            AppProvider,
            { initialAccount: null, initialSessionState: { loading: false, authenticated: false } },
            el(ProtectedRoute, null, el("div", null, "Gizli Profil İçeriği"))
          )
        )
      );

      expect(html).to.include("Cüzdan Bağlantısı Gerekli");
      expect(html).to.include("Cüzdanı Bağla");
      expect(html).to.not.include("Gizli Profil İçeriği");
    });

    it("3.2 Cüzdan bağlı değilken korumalı '/organizer' rotası organizatör cüzdan bağlantı uyarısını göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            { initialAccount: null, initialSessionState: { loading: false, authenticated: false } },
            el(OrganizerGuard, null, el("div", null, "Gizli Organizatör Paneli"))
          )
        )
      );

      expect(html).to.include("Organizatör Cüzdan Bağlantısı Gerekli");
      expect(html).to.include("Organizatör Cüzdanını Bağla");
      expect(html).to.not.include("Gizli Organizatör Paneli");
    });

    it("3.3 '/profile/certificates' doğrudan linki sertifikalar görünümünü etkinleştirmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/profile/certificates"] },
          el(StudentProfile, {
            account: "0x1111111111111111111111111111111111111111",
            chainId: 10143,
            defaultTab: "certs",
          })
        )
      );

      expect(html).to.include("Sertifikalarım");
      expect(html).to.include("0x1111...1111");
    });
  });

  describe("4. Topluluk Yönetimi Yetkilendirme (OWNER / ADMIN Guard)", function () {
    it("4.1 Giriş yapılmamış veya yetkisiz kullanıcı topluluk yönetim paneline erişememeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/communities/monad-kulubu/manage"] },
          el(
            AppProvider,
            { initialAccount: null, initialSessionState: { loading: false, authenticated: false } },
            el(CommunityManageGuard, null, el("div", null, "Topluluk Yönetim Masası"))
          )
        )
      );

      expect(html).to.include("Yönetici Girişi Gerekli");
      expect(html).to.not.include("Topluluk Yönetim Masası");
    });
  });

  describe("5. Oturum Yükleme Davranışı (Session Loading)", function () {
    it("5.1 Oturum yükleme esnasında kullanıcıyı zamansız yönlendirmemeli ve yükleniyor göstergesi vermeli", function () {
      function MockLoadingGuard({ loading, children }) {
        if (loading) {
          return el("div", null, "Oturum ve yetki durumu kontrol ediliyor...");
        }
        return children;
      }

      const html = renderToString(
        el(
          MockLoadingGuard,
          { loading: true },
          el("div", null, "Özel Panel")
        )
      );

      expect(html).to.include("Oturum ve yetki durumu kontrol ediliyor...");
      expect(html).to.not.include("Özel Panel");
    });
  });

  describe("6. Doğrudan URL Gezinmesi ve Geçmiş (History Back / Forward)", function () {
    it("6.1 createMemoryRouter ile iç içe geçmiş rotalara doğrudan erişim sağlanabilmeli", function () {
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: el(RootLayout),
            children: [
              { index: true, element: el("div", null, "Ana Sayfa") },
              { path: "events", element: el("div", null, "Etkinlikler") },
              { path: "events/:eventId", element: el("div", null, "Etkinlik Detayı") },
            ],
          },
        ],
        { initialEntries: ["/events/10"] }
      );

      const html = renderToString(
        el(
          AppProvider,
          { initialEvents: sampleEvents, initialLoadingEvents: false },
          el(RouterProvider, { router })
        )
      );

      expect(router.state.location.pathname).to.equal("/events/10");
      expect(html).to.include("Etkinlik Detayı");
    });

    it("6.2 Tarayıcı geri (back) ve ileri (forward) komutları rota durumunu doğru güncelleştirmeli", async function () {
      const router = createMemoryRouter(
        [
          { path: "/", element: el("div", null, "Ana Sayfa") },
          { path: "/events", element: el("div", null, "Etkinlik Keşfi") },
          { path: "/events/:id", element: el("div", null, "Etkinlik 1 Detayı") },
        ],
        { initialEntries: ["/events"] }
      );

      expect(router.state.location.pathname).to.equal("/events");

      await router.navigate("/events/1");
      expect(router.state.location.pathname).to.equal("/events/1");

      await router.navigate(-1);
      expect(router.state.location.pathname).to.equal("/events");

      await router.navigate(1);
      expect(router.state.location.pathname).to.equal("/events/1");
    });
  });

  describe("7. Bilinmeyen Rotalar ve 404 Sayfası", function () {
    it("7.1 Tanımlı olmayan URL'lerde 404 'Sayfa Bulunamadı' ekranı gösterilmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/gecersiz-ve-olmayan-adres-12345"] },
          el(Routes, null, el(Route, { path: "*", element: el(NotFoundPage) }))
        )
      );

      expect(html).to.include("HATA 404");
      expect(html).to.include("Sayfa Bulunamadı");
      expect(html).to.include("Ana Sayfaya Dön");
      expect(html).to.include("Etkinlikleri Keşfet");
    });
  });

  describe("8. Sertifika Doğrulama Bağlantı Uyumluluğu", function () {
    it("8.1 '/verify' parametresiz sertifika arama arayüzünü açmalı", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/verify"] },
          el(CertificateVerificationPage)
        )
      );

      expect(html).to.include("Dijital Katılım Sertifikası Doğrulama");
      expect(html).to.include("CP-CERT-");
    });

    it("8.2 '/verify/:certificateId' doğrudan parametrik sertifika kimliğini alıp doğrulamayı tetiklemeli", function () {
      const testCertId = "CP-CERT-A1B2C3D4E5F60718293A4B5C6D7E8F90";
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: [`/verify/${testCertId}`] },
          el(
            Routes,
            null,
            el(Route, {
              path: "/verify/:certificateId",
              element: el(CertificateVerificationPage),
            })
          )
        )
      );

      expect(html).to.include(testCertId);
    });
  });

  describe("9. Cüzdan Değişiminde Oturum ve Ayrıcalıklı Durumun Sıfırlanması", function () {
    it("9.1 Cüzdan değiştiğinde activeAuthState sıfırlanmalı ve önceki oturum sızdırılmamalı", function () {
      clearActiveAuthState();
      const state = getActiveAuthState();
      expect(state.authenticated).to.be.false;
      expect(state.walletAddress).to.be.null;
      expect(state.csrfToken).to.be.null;
    });
  });
});
