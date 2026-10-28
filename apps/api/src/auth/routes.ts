import express from "express";
import type { Router } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "shared";
import { asyncHandler } from "../http/async-handler";
import { requireCsrfHeader } from "../middleware/csrf";
import {
  createAuthLimiter,
  createForgotPasswordLimiter,
  createLoginLimiter,
} from "../middleware/rate-limit";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import * as controller from "./controller";

export function createAuthRouter(): Router {
  const router = express.Router();

  const authLimiter = createAuthLimiter();
  const loginLimiter = createLoginLimiter();
  const forgotPasswordLimiter = createForgotPasswordLimiter();

  router.post(
    "/register",
    authLimiter,
    validate({ body: registerSchema }),
    asyncHandler(controller.register),
  );

  router.post(
    "/verify-email",
    authLimiter,
    validate({ body: verifyEmailSchema }),
    asyncHandler(controller.verifyEmail),
  );

  router.post(
    "/login",
    loginLimiter,
    validate({ body: loginSchema }),
    asyncHandler(controller.login),
  );

  router.post("/refresh", authLimiter, requireCsrfHeader, asyncHandler(controller.refresh));

  router.post("/logout", authLimiter, asyncHandler(controller.logout));

  router.post("/logout-all", requireAuth, asyncHandler(controller.logoutAll));

  router.get("/me", requireAuth, asyncHandler(controller.me));

  router.post(
    "/forgot-password",
    forgotPasswordLimiter,
    validate({ body: forgotPasswordSchema }),
    asyncHandler(controller.forgotPassword),
  );

  router.post(
    "/reset-password",
    authLimiter,
    validate({ body: resetPasswordSchema }),
    asyncHandler(controller.resetPassword),
  );

  return router;
}
