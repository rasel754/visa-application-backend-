import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { Prisma, Role, SubmissionStatus } from "@prisma/client";
import { z } from "zod";
import { getDhakaTodayStartUtc, parseDateBoundary } from "../lib/dates";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

export const createCompanySchema = z.object({
  name: z.string().trim().min(2, "Company name must be at least 2 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens.")
    .min(2, "Slug must be at least 2 characters."),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/, "Prefix must be 2 to 5 uppercase letters (e.g. IGL, SKY)."),
  logoUrl: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  adminEmail: z.string().trim().email("Admin email must be valid."),
  adminPassword: z.string().min(8, "Admin password must be at least 8 characters."),
  adminName: z.string().trim().min(2, "Admin name must be at least 2 characters."),
});

export const toggleCompanyStatusSchema = z.object({
  isActive: z.boolean(),
});

export const provisionUserSchema = z.object({
  email: z.string().trim().email("Admin email must be valid."),
  password: z.string().min(8, "Admin password must be at least 8 characters."),
  name: z.string().trim().min(2, "Admin name must be at least 2 characters."),
});

export async function getGlobalStats(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const todayStart = getDhakaTodayStartUtc();

    const [
      totalCompanies,
      activeCompanies,
      totalSubmissions,
      todaySubmissions,
      groupedStatus,
      companiesWithCounts,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.company.count({ where: { isActive: true } }),
      prisma.submission.count(),
      prisma.submission.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.submission.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.company.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          prefix: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              applications: true,
              users: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const byStatus: Record<SubmissionStatus, number> = {
      NEW: 0,
      CHECKED: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      REJECTED: 0,
    };

    for (const row of groupedStatus) {
      byStatus[row.status] = row._count.status;
    }

    res.json({
      companies: {
        total: totalCompanies,
        active: activeCompanies,
        suspended: totalCompanies - activeCompanies,
      },
      submissions: {
        total: totalSubmissions,
        today: todaySubmissions,
        byStatus,
      },
      companyBreakdown: companiesWithCounts.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        prefix: c.prefix,
        isActive: c.isActive,
        createdAt: c.createdAt,
        totalApplications: c._count.applications,
        totalUsers: c._count.users,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function listCompanies(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            users: true,
            applications: true,
            inviteLinks: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    res.json({ items: companies });
  } catch (err) {
    next(err);
  }
}

export async function createCompany(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = createCompanySchema.parse(req.body);
    const normalizedEmail = data.adminEmail.toLowerCase().trim();

    // Check unique slug & prefix
    const existingSlug = await prisma.company.findUnique({
      where: { slug: data.slug },
    });
    if (existingSlug) {
      next(new AppError(400, "A company with this slug already exists."));
      return;
    }

    const existingPrefix = await prisma.company.findUnique({
      where: { prefix: data.prefix },
    });
    if (existingPrefix) {
      next(new AppError(400, "A company with this prefix already exists."));
      return;
    }

    // Check admin email
    const existingUser = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      next(new AppError(400, "An admin user with this email already exists."));
      return;
    }

    const passwordHash = await bcrypt.hash(data.adminPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: data.name,
          slug: data.slug,
          prefix: data.prefix,
          logoUrl: data.logoUrl || null,
          phone: data.phone || null,
          address: data.address || null,
          isActive: true,
        },
      });

      const user = await tx.adminUser.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: data.adminName,
          role: Role.COMPANY,
          companyId: company.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      return { company, user };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getCompanyDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id ?? "").trim();
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            applications: true,
            inviteLinks: true,
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

export async function toggleCompanyStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id ?? "").trim();
    const { isActive } = toggleCompanyStatusSchema.parse(req.body);

    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      next(new AppError(404, "Company not found."));
      return;
    }

    const updated = await prisma.company.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        slug: true,
        prefix: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function provisionCompanyUser(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(
    new AppError(
      403,
      "Super Admin cannot create staff for agencies. Staff creation is restricted exclusively to Agency Admins.",
    ),
  );
}
