import { createRouter } from "../utils/expressAdapter.js";

export function createCommunityRoutes({ communityController, requireAuthSession }) {
  const router = createRouter();

  // Public Keşif & Listeleme
  router.get("/", communityController.getCommunities);

  // Kullanıcının Üyelikleri (SIWE oturumu gerektirir) — /:idOrSlug'dan önce tanımlanmalıdır
  router.get("/me", requireAuthSession, communityController.getUserCommunities);

  // Topluluk Oluşturma (SIWE oturumu gerektirir)
  router.post("/", requireAuthSession, communityController.createCommunity);

  // Public Topluluk Profili & Etkinlikleri
  router.get("/:idOrSlug", communityController.getCommunityProfile);
  router.get("/:idOrSlug/events", communityController.getCommunityEvents);

  // Üyelik İşlemleri (Katılma & Ayrılma)
  router.post("/:idOrSlug/join", requireAuthSession, communityController.joinCommunity);
  router.post("/:idOrSlug/leave", requireAuthSession, communityController.leaveCommunity);

  // Topluluk Yönetimi & Üyeler (OWNER / ADMIN)
  router.patch("/:idOrSlug", requireAuthSession, communityController.updateCommunity);
  router.get("/:idOrSlug/members", requireAuthSession, communityController.getCommunityMembers);
  router.get("/:idOrSlug/applications", requireAuthSession, communityController.getCommunityApplications);
  router.post(
    "/:idOrSlug/applications/:memberId/approve",
    requireAuthSession,
    communityController.approveApplication
  );
  router.post(
    "/:idOrSlug/applications/:memberId/reject",
    requireAuthSession,
    communityController.rejectApplication
  );
  router.patch(
    "/:idOrSlug/members/:memberId/role",
    requireAuthSession,
    communityController.updateMemberRole
  );
  router.delete(
    "/:idOrSlug/members/:memberId",
    requireAuthSession,
    communityController.removeMember
  );

  // Etkinlik Bağlama & Çözme (Event Integration)
  router.post(
    "/:idOrSlug/events/link",
    requireAuthSession,
    communityController.linkEventToCommunity
  );
  router.delete(
    "/:idOrSlug/events/unlink",
    requireAuthSession,
    communityController.unlinkEventFromCommunity
  );

  // Topluluk Analitiği
  router.get(
    "/:idOrSlug/analytics",
    requireAuthSession,
    communityController.getCommunityAnalytics
  );

  return router;
}
