import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import {
  fromPrismaProfession,
  getCountry,
  resolveProfessionKey,
  toPrismaProfession,
} from "../../config/form-data";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { generateSecureToken } from "../../lib/tokens";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { tenantIsolation } from "../../middlewares/tenantIsolation";
import { validateBody } from "../../middleware/validate";

const createLinkSchema = z.object({
  companyId: z.string().trim().optional(),
  countryCode: z.string().trim().min(1).nullable().optional(),
  profession: z.string().trim().min(1).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export const publicLinksRouter = Router();
export const adminLinksRouter = Router();

publicLinksRouter.get(
  "/:token",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = String(req.params.token ?? "").trim();
      if (!token) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      const link = await prisma.intakeLink.findUnique({
        where: { token },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              prefix: true,
              logoUrl: true,
              phone: true,
              address: true,
              isActive: true,
            },
          },
        },
      });

      if (!link || link.usedAt !== null) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      if (!link.company.isActive) {
        next(
          new AppError(
            403,
            "The visa agency that issued this link is currently inactive or suspended.",
          ),
        );
        return;
      }

      res.json({
        valid: true,
        country_code: link.countryCode,
        profession: fromPrismaProfession(link.profession),
        company: {
          id: link.company.id,
          name: link.company.name,
          slug: link.company.slug,
          prefix: link.company.prefix,
          logoUrl: link.company.logoUrl,
          phone: link.company.phone,
          address: link.company.address,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

adminLinksRouter.use(authMiddleware, tenantIsolation);

adminLinksRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantWhere = (req.tenantWhere ?? {}) as Prisma.IntakeLinkWhereInput;

      const links = await prisma.intakeLink.findMany({
        where: tenantWhere,
        orderBy: { createdAt: "desc" },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              prefix: true,
            },
          },
          submissions: {
            select: { reference: true },
            take: 1,
          },
        },
      });

      const items = links.map((link) => {
        const country = link.countryCode ? getCountry(link.countryCode) : null;
        return {
          id: link.id,
          token: link.token,
          companyId: link.companyId,
          company: link.company,
          countryCode: link.countryCode,
          countryName: country?.country ?? null,
          profession: link.profession,
          expiresAt: link.expiresAt,
          usedAt: link.usedAt,
          createdAt: link.createdAt,
          submissionReference: link.submissions[0]?.reference ?? null,
        };
      });

      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

adminLinksRouter.post(
  "/",
  validateBody(createLinkSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as z.infer<typeof createLinkSchema>;
      const user = req.user!;

      let targetCompanyId: string;
      if (user.role === Role.COMPANY) {
        if (!user.companyId) {
          next(new AppError(403, "No company assigned to this account."));
          return;
        }
        targetCompanyId = user.companyId;
      } else {
        if (body.companyId) {
          targetCompanyId = body.companyId;
        } else {
          const defaultComp = await prisma.company.findFirst();
          if (!defaultComp) {
            next(new AppError(400, "No company available."));
            return;
          }
          targetCompanyId = defaultComp.id;
        }
      }

      // Verify company is active
      const company = await prisma.company.findUnique({
        where: { id: targetCompanyId },
      });
      if (!company || !company.isActive) {
        next(new AppError(400, "Target company not found or inactive."));
        return;
      }

      const rawCountryCode = body.countryCode?.trim() || null;
      const rawProfession = body.profession?.trim() || null;

      let normalizedCountryCode: string | null = null;
      let normalizedProfession = null;

      if (rawCountryCode) {
        const country = getCountry(rawCountryCode);
        if (!country) {
          next(
            new AppError(400, ERROR_MESSAGES.genericValidation, {
              countryCode: "Please choose a valid country.",
            }),
          );
          return;
        }
        normalizedCountryCode = country.country_code;
      }

      if (rawProfession) {
        const resolved = resolveProfessionKey(rawProfession);
        if (!resolved) {
          next(
            new AppError(400, ERROR_MESSAGES.genericValidation, {
              profession: "Please choose Student, Businessman, or Employee.",
            }),
          );
          return;
        }
        normalizedProfession = toPrismaProfession(resolved);
      }

      const expiresAt =
        typeof body.expiresInDays === "number"
          ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
          : null;

      const token = generateSecureToken(24);
      const created = await prisma.intakeLink.create({
        data: {
          token,
          companyId: targetCompanyId,
          countryCode: normalizedCountryCode,
          profession: normalizedProfession,
          expiresAt,
        },
        include: {
          company: {
            select: { id: true, name: true, slug: true, prefix: true },
          },
        },
      });

      const country = created.countryCode ? getCountry(created.countryCode) : null;

      res.status(201).json({
        id: created.id,
        token: created.token,
        companyId: created.companyId,
        company: created.company,
        countryCode: created.countryCode,
        countryName: country?.country ?? null,
        profession: created.profession,
        expiresAt: created.expiresAt,
        usedAt: created.usedAt,
        createdAt: created.createdAt,
        submissionReference: null,
      });
    } catch (err) {
      next(err);
    }
  },
);

adminLinksRouter.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const tenantWhere = (req.tenantWhere ?? {}) as Prisma.IntakeLinkWhereInput;

      const existing = await prisma.intakeLink.findFirst({
        where: { id, ...tenantWhere },
      });

      if (!existing) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      await prisma.intakeLink.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
