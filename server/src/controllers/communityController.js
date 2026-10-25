import { announcementCreateSchema, parseWithZod } from "../utils/validation.js";

export function createCommunityController({ communityService }) {
  if (!communityService) {
    throw new Error("createCommunityController: communityService dependency is required.");
  }

  async function createCommunity(req, res, next) {
    try {
      const walletAddress = req.session.walletAddress;
      const result = await communityService.createCommunity({
        walletAddress,
        data: req.body,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getCommunities(req, res, next) {
    try {
      const result = await communityService.getCommunities(req.query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getCommunityProfile(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const callerWallet = req.session?.walletAddress || null;
      const result = await communityService.getCommunityProfile(idOrSlug, callerWallet);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getCommunityEvents(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const result = await communityService.getCommunityEvents(idOrSlug, req.query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function joinCommunity(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const walletAddress = req.session.walletAddress;
      const result = await communityService.joinCommunity(idOrSlug, walletAddress);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function leaveCommunity(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const walletAddress = req.session.walletAddress;
      const result = await communityService.leaveCommunity(idOrSlug, walletAddress);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getUserCommunities(req, res, next) {
    try {
      const walletAddress = req.session.walletAddress;
      const result = await communityService.getUserCommunities(walletAddress);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getCommunityMembers(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const walletAddress = req.session.walletAddress;
      const result = await communityService.getCommunityMembers(idOrSlug, walletAddress, req.query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getCommunityApplications(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const walletAddress = req.session.walletAddress;
      const result = await communityService.getCommunityApplications(idOrSlug, walletAddress, req.query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function approveApplication(req, res, next) {
    try {
      const { idOrSlug, memberId } = req.params;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.approveApplication(idOrSlug, memberId, callerWallet);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function rejectApplication(req, res, next) {
    try {
      const { idOrSlug, memberId } = req.params;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.rejectApplication(idOrSlug, memberId, callerWallet);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function removeMember(req, res, next) {
    try {
      const { idOrSlug, memberId } = req.params;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.removeMember(idOrSlug, memberId, callerWallet);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function updateMemberRole(req, res, next) {
    try {
      const { idOrSlug, memberId } = req.params;
      const { role } = req.body;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.updateMemberRole(idOrSlug, memberId, role, callerWallet);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function updateCommunity(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.updateCommunity(idOrSlug, req.body, callerWallet);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function linkEventToCommunity(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const { eventId, chainId, contractAddress } = req.body;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.linkEventToCommunity(
        idOrSlug,
        eventId,
        chainId,
        contractAddress,
        callerWallet
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function unlinkEventFromCommunity(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const { eventId, chainId, contractAddress } = req.body;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.unlinkEventFromCommunity(
        idOrSlug,
        eventId,
        chainId,
        contractAddress,
        callerWallet
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getCommunityAnalytics(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const callerWallet = req.session.walletAddress;
      const result = await communityService.getCommunityAnalytics(idOrSlug, callerWallet);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function createAnnouncement(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const callerWallet = req.session.walletAddress;
      const validated = parseWithZod(announcementCreateSchema, req.body);
      const result = await communityService.createAnnouncement(idOrSlug, callerWallet, validated);
      res.status(201).json({
        success: true,
        message: "Duyuru başarıyla yayınlandı.",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async function getAnnouncements(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const result = await communityService.getAnnouncements(idOrSlug, req.query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }

  return {
    createCommunity,
    getCommunities,
    getCommunityProfile,
    getCommunityEvents,
    joinCommunity,
    leaveCommunity,
    getUserCommunities,
    getCommunityMembers,
    getCommunityApplications,
    approveApplication,
    rejectApplication,
    removeMember,
    updateMemberRole,
    updateCommunity,
    linkEventToCommunity,
    unlinkEventFromCommunity,
    getCommunityAnalytics,
    createAnnouncement,
    getAnnouncements,
  };
}
