import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

export const publicCompaniesRouter = Router();

publicCompaniesRouter.get(
  "/:slug",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = String(req.params.slug ?? "").trim().toLowerCase();
      if (!slug) {
        next(new AppError(404, "Company slug is required."));
        return;
      }

      const company = await prisma.company.findUnique({
        where: { slug },
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
      });

      if (!company) {
        next(new AppError(404, "Visa agency not found."));
        return;
      }

      if (!company.isActive) {
        next(
          new AppError(
            403,
            "This visa agency is currently inactive or suspended. New applications cannot be accepted at this time.",
          ),
        );
        return;
      }

      res.json({
        id: company.id,
        name: company.name,
        slug: company.slug,
        prefix: company.prefix,
        logoUrl: company.logoUrl,
        phone: company.phone,
        address: company.address,
        isActive: company.isActive,
      });
    } catch (err) {
      next(err);
    }
  },
);
