import { Router } from "express";
import { Role } from "@prisma/client";
import {
  createCompanyLink,
  createCompanyStaff,
  deleteCompanyLink,
  deleteCompanyStaff,
  getCompanyLinks,
  getCompanyProfile,
  getCompanyStaff,
  getCompanyStats,
  updateCompanyProfile,
} from "../../controllers/companyController";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { requireRole } from "../../middlewares/requireRole";
import { tenantIsolation } from "../../middlewares/tenantIsolation";
import { adminSubmissionsRouter } from "../submissions/submissions.routes";

export const companyRouter = Router();

// Strict RBAC: COMPANY or SUPER_ADMIN
companyRouter.use(
  authMiddleware,
  requireRole(Role.COMPANY, Role.SUPER_ADMIN),
  tenantIsolation,
);

companyRouter.get("/profile", getCompanyProfile);
companyRouter.patch("/profile", updateCompanyProfile);
companyRouter.get("/stats", getCompanyStats);
companyRouter.get("/links", getCompanyLinks);
companyRouter.post("/links", createCompanyLink);
companyRouter.delete("/links/:id", deleteCompanyLink);

// Dedicated Agency Staff Management (Exclusively Agency Admin)
companyRouter.get("/staff", getCompanyStaff);
companyRouter.post("/staff", createCompanyStaff);
companyRouter.delete("/staff/:id", deleteCompanyStaff);

// Mount submissions routes scoped to the tenant
companyRouter.use("/applications", adminSubmissionsRouter);
companyRouter.use("/submissions", adminSubmissionsRouter);
