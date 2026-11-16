import { Router } from "express";
import { Role } from "@prisma/client";
import {
  createCompany,
  getCompanyDetail,
  getGlobalStats,
  listCompanies,
  toggleCompanyStatus,
} from "../../controllers/superAdminController";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { requireRole } from "../../middlewares/requireRole";

export const superAdminRouter = Router();

// Strict RBAC: SUPER_ADMIN ONLY
superAdminRouter.use(authMiddleware, requireRole(Role.SUPER_ADMIN));

superAdminRouter.get("/stats", getGlobalStats);
superAdminRouter.get("/companies", listCompanies);
superAdminRouter.post("/companies", createCompany);
superAdminRouter.get("/companies/:id", getCompanyDetail);
superAdminRouter.patch("/companies/:id/status", toggleCompanyStatus);
