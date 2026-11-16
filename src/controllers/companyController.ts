import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { Role, SubmissionStatus } from "@prisma/client";
import { z } from "zod";
import {
  getCountry,
  resolveProfessionKey,
  toPrismaProfession,
} from "../config/form-data";
import { getDhakaTodayStartUtc } from "../lib/dates";
import { AppError, ERROR_MESSAGES } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { generateSecureToken } from "../lib/tokens";

export const updateProfileSchema = z.object({
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  logoUrl: z.string().trim().optional().nullable(),
});

export const createTenantLinkSchema = z.object({
  countryCode: z.string().trim().min(1, "Country is required."),
  profession: z.string().trim().min(1, "Profession is required."),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Staff name must be at least 2 characters."),
  email: z.string().trim().email("Staff email must be a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function getCompanyProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      next(new AppError(403, "No company assigned to this account."));
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: {
            applications: true,
            inviteLinks: true,
            users: true,
          },
        },
      },
    });

    if (!company) {
      next(new AppError(404, "Company not found."));
      return;
    }

    res.json(company);
  } catch (err) {
    next(err);
  }
}

export async function updateCompanyProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      next(new AppError(403, "No company assigned to this account."));
      return;
    }

    const data = updateProfileSchema.parse(req.body);
    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getCompanyStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      next(new AppError(403, "No company assigned to this account."));
      return;
    }

    const todayStart = getDhakaTodayStartUtc();
    const [total, today, grouped] = await Promise.all([
      prisma.submission.count({ where: { companyId } }),
      prisma.submission.count({
        where: { companyId, createdAt: { gte: todayStart } },
      }),
      prisma.submission.groupBy({
        by: ["status"],
        where: { companyId },
        _count: { status: true },
      }),
    ]);

    const byStatus: Record<SubmissionStatus, number> = {
      NEW: 0,
      CHECKED: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      REJECTED: 0,
    };

    for (const row of grouped) {
      byStatus[row.status] = row._count.status;
    }

    res.json({ total, today, byStatus });
  } catch (err) {
    next(err);
  }
}

export async function getCompanyLinks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      next(new AppError(403, "No company assigned to this account."));
      return;
    }

    const links = await prisma.intakeLink.findMany({
      where: { companyId },
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
        companyId: link.companyId,
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
}

export async function createCompanyLink(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      next(new AppError(403, "No company assigned to this account."));
      return;
    }

    const body = createTenantLinkSchema.parse(req.body);
    const country = getCountry(body.countryCode);
    if (!country) {
      next(
        new AppError(400, ERROR_MESSAGES.genericValidation, {
          countryCode: "Please choose a valid destination country.",
        }),
      );
      return;
    }
    const resolvedProfession = resolveProfessionKey(body.profession);
    if (!resolvedProfession) {
      next(
        new AppError(400, ERROR_MESSAGES.genericValidation, {
          profession: "Please choose Student, Businessman, or Employee.",
        }),
      );
      return;
    }
    const normalizedCountryCode = country.country_code;
    const normalizedProfession = toPrismaProfession(resolvedProfession);

    const expiresAt =
      typeof body.expiresInDays === "number"
        ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const token = generateSecureToken(24);
    const created = await prisma.intakeLink.create({
      data: {
        token,
        companyId,
        countryCode: normalizedCountryCode,
        profession: normalizedProfession,
        expiresAt,
      },
    });

    res.status(201).json({
      id: created.id,
      token: created.token,
      companyId: created.companyId,
      countryCode: created.countryCode,
      countryName: country.country,
      profession: created.profession,
      expiresAt: created.expiresAt,
      usedAt: created.usedAt,
      createdAt: created.createdAt,
      submissionReference: null,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCompanyLink(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    const id = String(req.params.id ?? "").trim();
    if (!companyId) {
      next(new AppError(403, "No company assigned to this account."));
      return;
    }

    const existing = await prisma.intakeLink.findFirst({
      where: { id, companyId },
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
}

export async function getCompanyStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user;
    if (user?.role !== Role.COMPANY || !user?.companyId) {
      next(
        new AppError(
          403,
          "Staff management is restricted exclusively to Agency Admins.",
        ),
      );
      return;
    }

    const staff = await prisma.adminUser.findMany({
      where: { companyId: user.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ items: staff });
  } catch (err) {
    next(err);
  }
}

export async function createCompanyStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user;
    if (user?.role !== Role.COMPANY || !user?.companyId) {
      next(
        new AppError(
          403,
          "Staff creation is restricted exclusively to Agency Admins.",
        ),
      );
      return;
    }

    const data = createStaffSchema.parse(req.body);
    const normalizedEmail = data.email.toLowerCase().trim();

    const existing = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      next(new AppError(400, "A staff user with this email address already exists."));
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const created = await prisma.adminUser.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: Role.COMPANY,
        companyId: user.companyId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function deleteCompanyStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user;
    if (user?.role !== Role.COMPANY || !user?.companyId) {
      next(
        new AppError(
          403,
          "Staff deletion is restricted exclusively to Agency Admins.",
        ),
      );
      return;
    }

    const targetId = String(req.params.id ?? "").trim();
    if (!targetId) {
      next(new AppError(400, "Invalid staff ID."));
      return;
    }

    if (targetId === user.id) {
      next(new AppError(400, "You cannot remove your own active staff account."));
      return;
    }

    const existing = await prisma.adminUser.findFirst({
      where: { id: targetId, companyId: user.companyId },
    });

    if (!existing) {
      next(new AppError(404, "Staff member not found in your agency team."));
      return;
    }

    await prisma.adminUser.delete({
      where: { id: existing.id },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
