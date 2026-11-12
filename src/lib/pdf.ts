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
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 45, bottom: 55, left: 45, right: 45 },
      bufferPages: true,
      info: {
        Title: `IGL Visa Help - ${submission.reference}`,
        Author: "IGL Visa Help",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const maxY = doc.page.height - doc.page.margins.bottom;

    const ensureSpace = (neededHeight: number): void => {
      if (doc.y + neededHeight > maxY) {
        doc.addPage();
      }
    };

    // Header
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#0F172A").text("IGL Visa Help", leftX, 42);
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#475569")
      .text("Visit Visa Application Summary", leftX, doc.y + 2);

    const lineY = doc.y + 8;
    doc
      .strokeColor("#CBD5E1")
      .lineWidth(1)
      .moveTo(leftX, lineY)
      .lineTo(leftX + pageWidth, lineY)
      .stroke();

    doc.y = lineY + 14;

    // Info box
    const infoRows: Array<[string, string]> = [
      ["Submission No.", submission.reference],
      ["Date Submitted", formatDateDisplay(submission.createdAt)],
      ["Country", sanitizePdfText(submission.countryName)],
      ["Visa Type", submission.visaType === "visit" ? "Visit Visa" : sanitizePdfText(submission.visaType)],
      ["Official Visa Name", sanitizePdfText(submission.officialVisaName)],
      ["Profession", sanitizePdfText(submission.professionLabel)],
    ];

    const boxStartY = doc.y;
    const labelColW = 130;
    const valueColW = pageWidth - labelColW - 24;
    let infoHeight = 16;
    for (const [, val] of infoRows) {
      doc.font("Helvetica").fontSize(10);
      const h = Math.max(15, doc.heightOfString(val, { width: valueColW }) + 4);
      infoHeight += h;
    }

    doc
      .roundedRect(leftX, boxStartY, pageWidth, infoHeight, 4)
      .fillAndStroke("#F8FAFC", "#CBD5E1");

    let curY = boxStartY + 10;
    for (const [k, v] of infoRows) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#334155")
        .text(k, leftX + 12, curY, { width: labelColW });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#0F172A")
        .text(v, leftX + 12 + labelColW, curY, { width: valueColW });
      const rowH = Math.max(15, doc.heightOfString(v, { width: valueColW }) + 4);
      curY += rowH;
    }

    doc.y = boxStartY + infoHeight + 18;

    const fieldLabelW = 200;
    const fieldValueW = pageWidth - fieldLabelW - 14;

    const renderSectionGroups = (groups: SectionGroup[], groupBanner?: string): void => {
      const renderable = groups.filter((group) => {
        const hasAnyAnswer = group.fields.some((f) =>
          isFieldAnswered(f, submission.answers[f.key]),
        );
        if (!hasAnyAnswer && !options.includeEmptyOptional) {
          return false;
        }
        return group.fields.some(
          (f) => isFieldAnswered(f, submission.answers[f.key]) || options.includeEmptyOptional,
        );
      });

      if (renderable.length === 0) return;

      if (groupBanner) {
        ensureSpace(78);
        const bannerY = doc.y;
        doc.rect(leftX, bannerY, pageWidth, 24).fill("#1E3A8A");
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#FFFFFF")
          .text(sanitizePdfText(groupBanner), leftX + 10, bannerY + 6, {
            width: pageWidth - 20,
          });
        doc.y = bannerY + 30;
      }

      for (const group of renderable) {
        const fieldsToRender = group.fields.filter((f) => {
          const answered = isFieldAnswered(f, submission.answers[f.key]);
          if (answered) return true;
          return options.includeEmptyOptional;
        });

        if (fieldsToRender.length === 0) {
          continue;
        }

        ensureSpace(56);

        const barY = doc.y;
        doc.rect(leftX, barY, pageWidth, 24).fill("#E2E8F0");
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#0F172A")
          .text(sanitizePdfText(group.section), leftX + 10, barY + 6, {
            width: pageWidth - 20,
          });
        doc.y = barY + 30;

        for (const field of fieldsToRender) {
          const rawVal = submission.answers[field.key];
          const answered = isFieldAnswered(field, rawVal);

          if (field.type === "table") {
            const rows = Array.isArray(rawVal)
              ? rawVal.filter(
                  (r): r is Record<string, unknown> =>
                    typeof r === "object" &&
                    r !== null &&
                    isTableRowNonEmpty(r as Record<string, unknown>),
                )
              : [];

            ensureSpace(48);
            doc
              .font("Helvetica-Bold")
              .fontSize(10)
              .fillColor("#334155")
              .text(sanitizePdfText(field.label), leftX, doc.y, { width: pageWidth });
            doc.y += 4;

            if (rows.length === 0) {
              doc
                .font("Helvetica")
                .fontSize(10)
                .fillColor("#64748B")
                .text("--", leftX + 8, doc.y);
              doc.y += 14;
              continue;
            }

            const columns = getTableColumns(field.key);
            const totalWeight = columns.reduce((acc, c) => acc + c.widthWeight, 0);
            const colWidths = columns.map((c) =>
              Math.floor((pageWidth * c.widthWeight) / totalWeight),
            );

            ensureSpace(24);
            let colX = leftX;
            const headerY = doc.y;
            doc.rect(leftX, headerY, pageWidth, 20).fillAndStroke("#F1F5F9", "#CBD5E1");
            columns.forEach((col, idx) => {
              const w = colWidths[idx] ?? 100;
              doc
                .font("Helvetica-Bold")
                .fontSize(9)
                .fillColor("#1E293B")
                .text(sanitizePdfText(col.header), colX + 5, headerY + 5, { width: w - 10 });
              colX += w;
            });
            doc.y = headerY + 20;

            for (const row of rows) {
              doc.font("Helvetica").fontSize(9);
              let rowHeight = 20;
              columns.forEach((col, idx) => {
                const cellText = sanitizePdfText(String(row[col.key] ?? "--"));
                const w = colWidths[idx] ?? 100;
                const h = doc.heightOfString(cellText, { width: w - 10 }) + 10;
                if (h > rowHeight) rowHeight = h;
              });

              ensureSpace(rowHeight + 4);
              const rowY = doc.y;
              doc.rect(leftX, rowY, pageWidth, rowHeight).stroke("#CBD5E1");
              let cellX = leftX;
              columns.forEach((col, idx) => {
                const cellText = sanitizePdfText(String(row[col.key] ?? "").trim() || "--");
                const w = colWidths[idx] ?? 100;
                doc
                  .font("Helvetica")
                  .fontSize(9)
                  .fillColor("#0F172A")
                  .text(cellText, cellX + 5, rowY + 5, { width: w - 10 });
                cellX += w;
              });
              doc.y = rowY + rowHeight;
            }
            doc.y += 10;
            continue;
          }

          const labelText = `${sanitizePdfText(field.label)}:`;
          const valueText = answered ? formatScalarAnswer(field, rawVal) : "--";

          doc.font("Helvetica-Bold").fontSize(9.5);
          const labelH = doc.heightOfString(labelText, { width: fieldLabelW });
          doc.font("Helvetica").fontSize(9.5);
          const valH = doc.heightOfString(valueText, { width: fieldValueW });
          const rowH = Math.max(labelH, valH, 14) + 6;

          ensureSpace(rowH + 4);
          const rowTop = doc.y;

          doc
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .fillColor("#334155")
            .text(labelText, leftX, rowTop, { width: fieldLabelW });

          doc
            .font("Helvetica")
            .fontSize(9.5)
            .fillColor(answered ? "#0F172A" : "#64748B")
            .text(valueText, leftX + fieldLabelW + 14, rowTop, { width: fieldValueW });

          const dividerY = rowTop + rowH - 2;
          doc
            .strokeColor("#F1F5F9")
            .lineWidth(0.75)
            .moveTo(leftX, dividerY)
            .lineTo(leftX + pageWidth, dividerY)
            .stroke();

          doc.y = rowTop + rowH + 2;
        }

        doc.y += 10;
      }
    };

    renderSectionGroups(groupFieldsBySection(submission.commonFields));
    if (submission.profileFields.length > 0) {
      renderSectionGroups(
        groupFieldsBySection(submission.profileFields),
        `Profession Details - ${submission.professionLabel}`,
      );
    }

    // Documents checklist section
    const uploadedKeys = new Set(submission.documents.map((d) => d.documentKey));
    const statusW = 80;
    const docLabelW = pageWidth - statusW - 14;

    const renderDocGroup = (title: string, docs: FormDocument[]): void => {
      if (docs.length === 0) return;

      ensureSpace(70);
      const docBarY = doc.y;
      doc.rect(leftX, docBarY, pageWidth, 24).fill("#E2E8F0");
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#0F172A")
        .text(sanitizePdfText(title), leftX + 10, docBarY + 6, { width: pageWidth - 20 });
      doc.y = docBarY + 30;

      for (const reqDoc of docs) {
        const isGiven = uploadedKeys.has(reqDoc.key);
        const docLabelText = sanitizePdfText(reqDoc.label);
        const statusText = isGiven ? "Given" : "Not given";

        doc.font("Helvetica").fontSize(9.5);
        const lh = doc.heightOfString(docLabelText, { width: docLabelW });
        const rowH = Math.max(lh, 14) + 6;

        ensureSpace(rowH + 4);
        const rowTop = doc.y;

        doc
          .font("Helvetica")
          .fontSize(9.5)
          .fillColor("#0F172A")
          .text(docLabelText, leftX, rowTop, { width: docLabelW });

        doc
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .fillColor(isGiven ? "#15803D" : "#64748B")
          .text(statusText, leftX + docLabelW + 14, rowTop, {
            width: statusW,
            align: "right",
          });

        const divY = rowTop + rowH - 2;
        doc
          .strokeColor("#F1F5F9")
          .lineWidth(0.75)
          .moveTo(leftX, divY)
          .lineTo(leftX + pageWidth, divY)
          .stroke();

        doc.y = rowTop + rowH + 2;
      }

      doc.y += 10;
    };

    renderDocGroup("Common Documents Checklist", submission.commonDocuments);
    if (submission.additionalDocuments.length > 0) {
      renderDocGroup(
        `Additional Documents (${submission.professionLabel})`,
        submission.additionalDocuments,
      );
    }

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const prevBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const footerY = doc.page.height - 34;
      doc
        .strokeColor("#CBD5E1")
        .lineWidth(0.5)
        .moveTo(leftX, footerY - 6)
        .lineTo(leftX + pageWidth, footerY - 6)
        .stroke();

      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor("#64748B")
        .text(
          "IGL Visa Help -- This form was filled online by the applicant.",
          leftX,
          footerY,
          { width: pageWidth - 90, lineBreak: false },
        );

      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor("#64748B")
        .text(`Page ${i + 1} of ${range.count}`, leftX + pageWidth - 85, footerY, {
          width: 85,
          align: "right",
          lineBreak: false,
        });

      doc.page.margins.bottom = prevBottomMargin;
    }

    doc.end();
  });
}
