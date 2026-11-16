import { Prisma } from "@prisma/client";

/**
 * Extracts and increments the sequence number for a given prefix in a list of references.
 */
export function parseNextSequence(references: string[], prefix: string): number {
  let maxSeq = 0;
  for (const ref of references) {
    if (!ref.startsWith(prefix)) continue;
    const suffix = ref.slice(prefix.length);
    const num = Number.parseInt(suffix, 10);
    if (Number.isFinite(num) && num > maxSeq) {
      maxSeq = num;
    }
  }
  return maxSeq + 1;
}

/**
 * Atomically generates the next company-prefixed reference number.
 * Format: `${prefix}-${year}-${seq}` (e.g. `IGL-2026-0001` or `SKY-2026-0001`).
 */
export async function generateNextReference(
  tx: Prisma.TransactionClient,
  companyPrefix: string,
  year = new Date().getFullYear(),
): Promise<string> {
  const cleanPrefix = companyPrefix.trim().toUpperCase();
  const fullPrefix = `${cleanPrefix}-${year}-`;

  const existingRefs = await tx.submission.findMany({
    where: { reference: { startsWith: fullPrefix } },
    select: { reference: true },
  });

  const nextSeq = parseNextSequence(
    existingRefs.map((r) => r.reference),
    fullPrefix,
  );

  return `${fullPrefix}${String(nextSeq).padStart(4, "0")}`;
}
