import {
  certificateIdParamSchema,
  certificateIssueBodySchema,
  parseWithZod,
  walletAddressParamSchema,
} from "../utils/validation.js";

export function createCertificateController({ certificateService }) {
  return {
    async issueCertificate(req, res) {
      const body = parseWithZod(certificateIssueBodySchema, req.body);
      const requestedWalletAddress =
        body.walletAddress || body.participantAddress || null;

      const result = await certificateService.issueCertificate({
        sessionWalletAddress: req.session?.walletAddress,
        eventId: body.eventId,
        requestedWalletAddress,
        displayName: body.displayName,
      });

      const statusCode = result.created ? 201 : 200;
      res.status(statusCode).json({
        success: true,
        created: result.created,
        idempotent: result.idempotent,
        data: result.certificate,
      });
    },

    async getMyCertificates(req, res) {
      const certificates = await certificateService.getMyCertificates(
        req.session?.walletAddress
      );

      res.status(200).json({
        success: true,
        count: certificates.length,
        data: certificates,
      });
    },

    async getWalletCertificates(req, res) {
      const { walletAddress } = parseWithZod(
        walletAddressParamSchema,
        req.params
      );
      const certificates =
        await certificateService.getCertificatesForWalletPublic(walletAddress);

      res.status(200).json({
        success: true,
        count: certificates.length,
        data: certificates,
      });
    },

    async getCertificateById(req, res) {
      const { certificateId } = parseWithZod(
        certificateIdParamSchema,
        req.params
      );
      const certificate =
        await certificateService.getCertificateById(certificateId);

      res.status(200).json({
        success: true,
        data: certificate,
      });
    },

    async verifyCertificate(req, res) {
      const { certificateId } = parseWithZod(
        certificateIdParamSchema,
        req.params
      );
      const verification =
        await certificateService.verifyCertificateById(certificateId);

      res.status(200).json({
        success: true,
        data: verification,
      });
    },
  };
}
