import { SESSION_COOKIE_NAME } from "../services/authService.js";
import { env } from "../utils/env.js";
import {
  parseWithZod,
  siweNonceQuerySchema,
  siweVerifyBodySchema,
} from "../utils/validation.js";

export function createAuthController({ authService }) {
  return {
    async getNonce(req, res) {
      const { walletAddress } = parseWithZod(siweNonceQuerySchema, req.query);
      const noncePayload = await authService.issueNonce({ walletAddress });

      res.status(200).json({
        success: true,
        data: noncePayload,
      });
    },

    async verifySiwe(req, res) {
      const { message, signature } = parseWithZod(siweVerifyBodySchema, req.body);
      const sessionData = await authService.verifySiweAndCreateSession({
        message,
        signature,
      });

      res.cookie(SESSION_COOKIE_NAME, sessionData.sessionToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "Lax",
        maxAge: sessionData.maxAgeSeconds,
        path: "/",
      });

      res.status(200).json({
        success: true,
        data: {
          authenticated: true,
          walletAddress: sessionData.walletAddress,
          chainId: sessionData.chainId,
          csrfToken: sessionData.csrfToken,
          expiresAt: sessionData.expiresAt,
        },
      });
    },

    async getSession(req, res) {
      const rawSessionToken = req.cookies?.[SESSION_COOKIE_NAME];
      const session = await authService.verifySession(rawSessionToken);

      if (!session) {
        res.status(200).json({
          success: true,
          data: {
            authenticated: false,
            walletAddress: null,
            csrfToken: null,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          authenticated: true,
          walletAddress: session.walletAddress,
          chainId: session.chainId,
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt,
        },
      });
    },

    async logout(req, res) {
      const rawSessionToken = req.cookies?.[SESSION_COOKIE_NAME];
      await authService.revokeSession(rawSessionToken);
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
      });

      res.status(200).json({
        success: true,
        data: {
          authenticated: false,
        },
      });
    },
  };
}
