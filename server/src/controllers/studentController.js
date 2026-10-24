import {
  parseWithZod,
  walletAddressParamSchema,
} from "../utils/validation.js";

export function createStudentController({ studentService }) {
  return {
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
