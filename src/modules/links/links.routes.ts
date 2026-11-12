import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
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
import { requireAdmin } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const createLinkSchema = z.object({
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
      });

      if (!link || link.usedAt !== null) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      res.json({
        valid: true,
        country_code: link.countryCode,
        profession: fromPrismaProfession(link.profession),
      });
    } catch (err) {
      next(err);
    }
  },
);

adminLinksRouter.use(requireAdmin);

adminLinksRouter.get(
  "/",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const links = await prisma.intakeLink.findMany({
        orderBy: { createdAt: "desc" },
        include: {
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
          countryCode: normalizedCountryCode,
          profession: normalizedProfession,
          expiresAt,
        },
      });

      const country = created.countryCode ? getCountry(created.countryCode) : null;

      res.status(201).json({
        id: created.id,
        token: created.token,
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
      const existing = await prisma.intakeLink.findUnique({ where: { id } });
      if (!existing) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }
      await prisma.intakeLink.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
