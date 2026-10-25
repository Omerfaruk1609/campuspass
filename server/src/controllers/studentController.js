import {
  parseWithZod,
  walletAddressParamSchema,
  studentProfileUpdateSchema,
} from "../utils/validation.js";

export function createStudentController({ studentService }) {
  return {
    async getProfile(req, res) {
      const { walletAddress } = parseWithZod(walletAddressParamSchema, req.params);
      const callerWalletAddress = req.session?.walletAddress || null;
      const profile = await studentService.getStudentProfile(walletAddress, {
        callerWalletAddress,
      });

      res.status(200).json({
        success: true,
        data: profile,
      });
    },

    async updateProfile(req, res) {
      const callerWalletAddress = req.session?.walletAddress;
      const validatedData = parseWithZod(studentProfileUpdateSchema, req.body);
      const updated = await studentService.upsertStudentProfile(
        callerWalletAddress,
        validatedData
      );

      res.status(200).json({
        success: true,
        message: "Öğrenci profili başarıyla güncellendi.",
        data: updated,
      });
    },

    async getStudentEvents(req, res) {
      const { walletAddress } = parseWithZod(walletAddressParamSchema, req.params);
      const profile = await studentService.getStudentProfileFromChainAndIndex(
        walletAddress
      );

      res.status(200).json({
        success: true,
        data: {
          walletAddress: profile.walletAddress,
          privacyNotice: profile.privacyNotice,
          registeredEvents: profile.registeredEvents,
          upcomingEvents: profile.upcomingEvents,
          pastEvents: profile.pastEvents,
          stats: profile.stats,
        },
      });
    },

    async getStudentAttendance(req, res) {
      const { walletAddress } = parseWithZod(walletAddressParamSchema, req.params);
      const profile = await studentService.getStudentProfileFromChainAndIndex(
        walletAddress
      );

      res.status(200).json({
        success: true,
        data: {
          walletAddress: profile.walletAddress,
          privacyNotice: profile.privacyNotice,
          attendedEvents: profile.attendedEvents,
          timeline: profile.timeline,
          stats: profile.stats,
        },
      });
    },
  };
}
