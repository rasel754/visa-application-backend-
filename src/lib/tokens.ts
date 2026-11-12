import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AdminJwtPayload {
  sub: string;
  email: string;
  name: string;
}

export interface OtpJwtPayload {
  otpId: string;
  phone: string;
}

export function generateSecureToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "7d",
    issuer: "igl-visa-help",
  });
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    issuer: "igl-visa-help",
  });

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded.sub !== "string" ||
    typeof (decoded as Record<string, unknown>).email !== "string" ||
    typeof (decoded as Record<string, unknown>).name !== "string"
  ) {
    throw new Error("Invalid token payload");
  }

  return {
    sub: decoded.sub,
    email: (decoded as Record<string, unknown>).email as string,
    name: (decoded as Record<string, unknown>).name as string,
  };
}

export function signOtpToken(payload: OtpJwtPayload): string {
  return jwt.sign(
    {
      sub: payload.otpId,
      phone: payload.phone,
      purpose: "otp_submission",
    },
    env.JWT_SECRET,
    {
      expiresIn: "10m",
      issuer: "igl-visa-help",
    },
  );
}

export function verifyOtpToken(token: string): OtpJwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: "igl-visa-help",
    });

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.sub !== "string" ||
      typeof (decoded as Record<string, unknown>).phone !== "string" ||
      (decoded as Record<string, unknown>).purpose !== "otp_submission"
    ) {
      return null;
    }

    return {
      otpId: decoded.sub,
      phone: (decoded as Record<string, unknown>).phone as string,
    };
  } catch {
    return null;
  }
}
