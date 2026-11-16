import PDFDocument from "pdfkit";
import {
  FormDocument,
  FormField,
  SectionGroup,
  groupFieldsBySection,
} from "../config/form-data";

export interface PdfSubmissionInput {
  reference: string;
  countryName: string;
  visaType: string;
  professionLabel: string;
  officialVisaName: string;
  createdAt: Date;
  answers: Record<string, unknown>;
  documents: Array<{
    documentKey: string;
    label: string;
    originalName: string;
  }>;
  commonFields: FormField[];
  profileFields: FormField[];
  commonDocuments: FormDocument[];
  additionalDocuments: FormDocument[];
  company?: {
    name: string;
    prefix: string;
    phone?: string | null;
    address?: string | null;
    logoUrl?: string | null;
  } | null;
}

export interface PdfBuildOptions {
  includeEmptyOptional: boolean;
}

function sanitizePdfText(value: string): string {
  const normalized = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u00A0/g, " ");

  let result = "";
  for (const ch of normalized) {
    const code = ch.charCodeAt(0);
    const allowed = code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 255);
    result += allowed ? ch : "?";
  }
  return result;
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatYmdForDisplay(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return raw;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isTableRowNonEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).some((val) => typeof val === "string" && val.trim().length > 0);
}

function getTableColumns(
  fieldKey: string,
): Array<{ key: string; header: string; widthWeight: number }> {
  if (fieldKey === "other_education") {
    return [
      { key: "degree", header: "Degree / Qualification", widthWeight: 3.5 },
      { key: "institution", header: "Institution Name", widthWeight: 4.5 },
    ];
  }
  if (fieldKey === "education_history") {
    return [
      { key: "institution", header: "Institution", widthWeight: 3.2 },
      { key: "years", header: "Years From-To", widthWeight: 1.8 },
      { key: "qualification", header: "Qualification", widthWeight: 2.5 },
      { key: "major", header: "Major", widthWeight: 2.5 },
    ];
  }
  if (fieldKey === "work_experience_history") {
    return [
      { key: "employer", header: "Employer", widthWeight: 3.5 },
      { key: "position", header: "Position", widthWeight: 3.5 },
      { key: "years", header: "Years From-To", widthWeight: 2.0 },
    ];
  }
  return [
    { key: "col1", header: "Item", widthWeight: 1 },
    { key: "col2", header: "Details", widthWeight: 2 },
  ];
}

function isFieldAnswered(field: FormField, rawValue: unknown): boolean {
  if (field.type === "table") {
    if (!Array.isArray(rawValue)) return false;
    return rawValue.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        isTableRowNonEmpty(item as Record<string, unknown>),
    );
  }
  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue);
  }
  if (typeof rawValue === "string") {
    return rawValue.trim().length > 0;
  }
  return false;
}

function formatScalarAnswer(field: FormField, rawValue: unknown): string {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return String(rawValue);
  }
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    const formatted = field.type === "date" ? formatYmdForDisplay(trimmed) : trimmed;
    return sanitizePdfText(formatted);
  }
  return "";
}

export async function buildSubmissionPdfBuffer(
  submission: PdfSubmissionInput,
  options: PdfBuildOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // A4 dimensions: 595.28 x 841.89 points
    const brandName = submission.company?.name || "IGL Visa Help";
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 20, bottom: 20, left: 28, right: 28 },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `${brandName} - ${submission.reference}`,
        Author: brandName,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    // Zero out bottom margin so PDFKit does not auto-insert extra pages
    doc.page.margins.bottom = 0;

    const leftX = 28;
    const pageWidth = doc.page.width - 56; // 539.28
    const pageBottomY = doc.page.height; // 841.89
    const footerY = pageBottomY - 20;

    // 1. Header (Compact modern bar)
    const headerTop = 20;
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor("#0F172A")
      .text(sanitizePdfText(brandName), leftX, headerTop);

    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#475569")
      .text("Visit Visa Application Summary", leftX, headerTop + 17);

    // Header Right
    const headerRightW = 240;
    const headerRightX = leftX + pageWidth - headerRightW;
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor("#1E3A8A")
      .text(`Ref: ${submission.reference}`, headerRightX, headerTop + 1, {
        width: headerRightW,
        align: "right",
      });

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748B")
      .text(
        `Submitted: ${formatDateDisplay(submission.createdAt)}`,
        headerRightX,
        headerTop + 16,
        { width: headerRightW, align: "right" },
      );

    const headerDividerY = headerTop + 31;
    doc
      .strokeColor("#CBD5E1")
      .lineWidth(0.75)
      .moveTo(leftX, headerDividerY)
      .lineTo(leftX + pageWidth, headerDividerY)
      .stroke();

    // 2. Info Box (2-column key-value grid)
    const infoBoxY = headerDividerY + 5;
    const infoBoxH = 44;
    doc
      .roundedRect(leftX, infoBoxY, pageWidth, infoBoxH, 3)
      .fillAndStroke("#F8FAFC", "#CBD5E1");

    const infoColW = (pageWidth - 24) / 2;
    const infoRowsLeft: Array<[string, string]> = [
      ["Submission No.:", submission.reference],
      ["Country:", sanitizePdfText(submission.countryName)],
      ["Visa Type:", submission.visaType === "visit" ? "Visit Visa" : sanitizePdfText(submission.visaType)],
    ];
    const infoRowsRight: Array<[string, string]> = [
      ["Date Submitted:", formatDateDisplay(submission.createdAt)],
      ["Official Visa Name:", sanitizePdfText(submission.officialVisaName)],
      ["Profession:", sanitizePdfText(submission.professionLabel)],
    ];

    let infoRowY = infoBoxY + 5;
    for (let r = 0; r < 3; r++) {
      const leftItem = infoRowsLeft[r];
      if (leftItem) {
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor("#475569")
          .text(leftItem[0], leftX + 8, infoRowY, { width: 92 });
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor("#0F172A")
          .text(leftItem[1], leftX + 102, infoRowY, {
            width: infoColW - 98,
            lineBreak: false,
          });
      }

      const rightItem = infoRowsRight[r];
      if (rightItem) {
        const rightColStart = leftX + 12 + infoColW;
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor("#475569")
          .text(rightItem[0], rightColStart, infoRowY, { width: 95 });
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor("#0F172A")
          .text(rightItem[1], rightColStart + 100, infoRowY, {
            width: infoColW - 98,
            lineBreak: false,
          });
      }

      infoRowY += 12.5;
    }

    doc.y = infoBoxY + infoBoxH + 5;

    // 3. Sections & Fields (2-column layout to fit on 1 page)
    const orderedAllFields = [...submission.commonFields, ...submission.profileFields];
    const rawGroups = groupFieldsBySection(orderedAllFields);

    const isStudent =
      submission.professionLabel.toLowerCase().includes("student");

    const hasNoEducationAnswer =
      !isStudent &&
      (submission.answers["has_no_education"] === true ||
        submission.answers["has_no_education"] === "yes" ||
        submission.answers["has_no_education"] === "true");

    const renderableGroups: SectionGroup[] = [];
    for (const group of rawGroups) {
      const answeredFields = group.fields.filter((f) => {
        if (group.section === "Educational Information") {
          if (hasNoEducationAnswer) {
            return f.key === "has_no_education";
          }
          if (f.key === "has_no_education") return false;
        }

        const rawVal =
          f.key === "has_no_education" && hasNoEducationAnswer
            ? "No Formal Education"
            : submission.answers[f.key];

        const answered = isFieldAnswered(f, rawVal);
        if (answered) return true;
        return options.includeEmptyOptional;
      });

      if (answeredFields.length > 0) {
        renderableGroups.push({ section: group.section, fields: answeredFields });
      }
    }

    const colGap = 10;
    const halfW = (pageWidth - colGap) / 2;

    for (const group of renderableGroups) {
      const barY = doc.y;
      doc.rect(leftX, barY, pageWidth, 14).fill("#F1F5F9");
      doc.rect(leftX, barY, 3, 14).fill("#1E3A8A");

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#0F172A")
        .text(sanitizePdfText(group.section), leftX + 8, barY + 3, {
          width: pageWidth - 16,
        });

      doc.y = barY + 16;

      const fields = group.fields;
      let i = 0;
      while (i < fields.length) {
        const fieldA = fields[i]!;

        // Tables span full width
        if (fieldA.type === "table") {
          const rawVal = submission.answers[fieldA.key];
          const rows = Array.isArray(rawVal)
            ? rawVal.filter(
                (r): r is Record<string, unknown> =>
                  typeof r === "object" &&
                  r !== null &&
                  isTableRowNonEmpty(r as Record<string, unknown>),
              )
            : [];

          const tableTopY = doc.y;
          doc
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .fillColor("#334155")
            .text(sanitizePdfText(fieldA.label), leftX, tableTopY);
          doc.y += 2;

          if (rows.length > 0) {
            const columns = getTableColumns(fieldA.key);
            const totalWeight = columns.reduce((acc, c) => acc + c.widthWeight, 0);
            const colWidths = columns.map((c) =>
              Math.floor((pageWidth * c.widthWeight) / totalWeight),
            );

            const thY = doc.y;
            doc.rect(leftX, thY, pageWidth, 13).fillAndStroke("#F8FAFC", "#CBD5E1");
            let thX = leftX;
            columns.forEach((col, idx) => {
              const w = colWidths[idx] ?? 100;
              doc
                .font("Helvetica-Bold")
                .fontSize(7)
                .fillColor("#1E293B")
                .text(sanitizePdfText(col.header), thX + 4, thY + 2.5, { width: w - 8 });
              thX += w;
            });
            doc.y = thY + 13;

            for (const r of rows) {
              const trY = doc.y;
              doc.rect(leftX, trY, pageWidth, 13).stroke("#E2E8F0");
              let tdX = leftX;
              columns.forEach((col, idx) => {
                const w = colWidths[idx] ?? 100;
                const cellText = sanitizePdfText(String(r[col.key] ?? "").trim() || "--");
                doc
                  .font("Helvetica")
                  .fontSize(7)
                  .fillColor("#0F172A")
                  .text(cellText, tdX + 4, trY + 2.5, { width: w - 8, lineBreak: false });
                tdX += w;
              });
              doc.y = trY + 13;
            }
          } else {
            doc.font("Helvetica").fontSize(7.5).fillColor("#64748B").text("--", leftX + 4, doc.y);
            doc.y += 10;
          }

          doc.y += 3;
          i++;
          continue;
        }

        // Long text or textarea can span full width
        const isFullWidthField = fieldA.type === "textarea";

        let fieldB: FormField | undefined;
        if (!isFullWidthField && i + 1 < fields.length && fields[i + 1]!.type !== "table" && fields[i + 1]!.type !== "textarea") {
          fieldB = fields[i + 1];
          i += 2;
        } else {
          i++;
        }

        const renderFieldCell = (f: FormField, x: number, y: number, w: number): number => {
          const displayLabel = f.subgroup ? `${f.subgroup} - ${f.label}` : f.label;
          const labelText = `${sanitizePdfText(displayLabel)}:`;
          const rawVal =
            f.key === "has_no_education" && hasNoEducationAnswer
              ? "No Formal Education"
              : submission.answers[f.key];
          const answered = isFieldAnswered(f, rawVal) || (f.key === "has_no_education" && hasNoEducationAnswer);
          const valText = answered ? formatScalarAnswer(f, rawVal) || "--" : "--";

          const labelW = Math.min(105, Math.floor(w * 0.42));
          const valW = w - labelW - 4;

          doc.font("Helvetica-Bold").fontSize(7.5);
          const lh = doc.heightOfString(labelText, { width: labelW });
          doc.font("Helvetica").fontSize(7.5);
          const vh = doc.heightOfString(valText, { width: valW });
          const cellH = Math.max(11, lh, vh);

          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#475569").text(labelText, x, y, { width: labelW });
          doc
            .font("Helvetica")
            .fontSize(7.5)
            .fillColor(answered ? "#0F172A" : "#64748B")
            .text(valText, x + labelW + 4, y, { width: valW });

          return cellH;
        };

        const curRowY = doc.y;
        const hA = renderFieldCell(fieldA, leftX, curRowY, fieldB ? halfW : pageWidth);
        let hB = 0;
        if (fieldB) {
          hB = renderFieldCell(fieldB, leftX + halfW + colGap, curRowY, halfW);
        }
        const rowH = Math.max(hA, hB);

        const divY = curRowY + rowH + 1.5;
        doc
          .strokeColor("#F1F5F9")
          .lineWidth(0.5)
          .moveTo(leftX, divY)
          .lineTo(leftX + pageWidth, divY)
          .stroke();

        doc.y = divY + 2;
      }

      doc.y += 2.5;
    }

    // 4. Documents Checklist Section (Balanced 2-column layout)
    const uploadedKeys = new Set(submission.documents.map((d) => d.documentKey));
    const hasCommonDocs = submission.commonDocuments.length > 0;
    const hasAddDocs = submission.additionalDocuments.length > 0;

    if (hasCommonDocs || hasAddDocs) {
      const docBarY = doc.y;
      doc.rect(leftX, docBarY, pageWidth, 14).fill("#F1F5F9");
      doc.rect(leftX, docBarY, 3, 14).fill("#1E3A8A");

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#0F172A")
        .text("Documents Checklist", leftX + 8, docBarY + 3, {
          width: pageWidth - 16,
        });

      doc.y = docBarY + 16;

      // Determine document column distribution
      let colLeftDocs: FormDocument[] = [];
      let colRightDocs: FormDocument[] = [];
      let leftHeader = "";
      let rightHeader = "";

      if (hasCommonDocs && hasAddDocs) {
        colLeftDocs = submission.commonDocuments;
        colRightDocs = submission.additionalDocuments;
        leftHeader = "Common Documents";
        rightHeader = `Additional Documents (${submission.professionLabel})`;
      } else {
        const combined = hasCommonDocs ? submission.commonDocuments : submission.additionalDocuments;
        const halfCount = Math.ceil(combined.length / 2);
        colLeftDocs = combined.slice(0, halfCount);
        colRightDocs = combined.slice(halfCount);
      }

      const docStartY = doc.y;
      let leftY = docStartY;

      if (leftHeader) {
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#1E3A8A").text(leftHeader, leftX, leftY);
        leftY += 10;
      }

      for (const d of colLeftDocs) {
        const isGiven = uploadedKeys.has(d.key);
        const labelText = sanitizePdfText(d.label);
        const statusText = isGiven ? "Given" : "Not given";

        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#0F172A")
          .text(labelText, leftX, leftY, { width: halfW - 46, lineBreak: false });

        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .fillColor(isGiven ? "#15803D" : "#64748B")
          .text(statusText, leftX + halfW - 44, leftY, { width: 44, align: "right" });

        const dLineY = leftY + 9.5;
        doc
          .strokeColor("#F1F5F9")
          .lineWidth(0.5)
          .moveTo(leftX, dLineY)
          .lineTo(leftX + halfW, dLineY)
          .stroke();

        leftY += 11.5;
      }

      let rightY = docStartY;
      const rightColX = leftX + halfW + colGap;

      if (rightHeader) {
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#1E3A8A").text(rightHeader, rightColX, rightY);
        rightY += 10;
      }

      for (const d of colRightDocs) {
        const isGiven = uploadedKeys.has(d.key);
        const labelText = sanitizePdfText(d.label);
        const statusText = isGiven ? "Given" : "Not given";

        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#0F172A")
          .text(labelText, rightColX, rightY, { width: halfW - 46, lineBreak: false });

        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .fillColor(isGiven ? "#15803D" : "#64748B")
          .text(statusText, rightColX + halfW - 44, rightY, { width: 44, align: "right" });

        const dLineY = rightY + 9.5;
        doc
          .strokeColor("#F1F5F9")
          .lineWidth(0.5)
          .moveTo(rightColX, dLineY)
          .lineTo(rightColX + halfW, dLineY)
          .stroke();

        rightY += 11.5;
      }

      doc.y = Math.max(leftY, rightY) + 3;
    }

    // 5. Bottom Footer (Centered at the bottom of the page)
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const prevBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc
        .strokeColor("#CBD5E1")
        .lineWidth(0.5)
        .moveTo(leftX, footerY - 5)
        .lineTo(leftX + pageWidth, footerY - 5)
        .stroke();

      const footerText = submission.company
        ? sanitizePdfText(
            [
              submission.company.name,
              submission.company.phone,
              submission.company.address,
            ]
              .filter(Boolean)
              .join(" | "),
          )
        : "Design and Developed by: IGL Web Ltd | +880-1958-666999";

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748B")
        .text(
          footerText,
          leftX,
          footerY,
          {
            width: pageWidth,
            align: "center",
            lineBreak: false,
          },
        );

      doc.page.margins.bottom = prevBottomMargin;
    }

    doc.end();
  });
}
