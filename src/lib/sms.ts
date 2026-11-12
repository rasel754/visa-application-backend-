import { env } from "../config/env";

const DEFAULT_SMS_TEMPLATE =
  "Your IGL Visa Help verification code is {code}. Valid for 5 minutes. Do not share it with anyone.";
const SMS_TIMEOUT_MS = 10_000;

export type SendSmsResult =
  | { ok: true; gatewayMessageId?: string; devFallback?: boolean }
  | { ok: false; reason: string };

interface SmsRuntimeConfig {
  apiUrl: string;
  apiKey: string;
  senderId: string;
  format: "query" | "form" | "json";
  authHeader: boolean;
  template: string;
  nodeEnv: string;
}

function getSmsRuntimeConfig(): SmsRuntimeConfig {
  const apiUrl = (process.env.SMS_API_URL ?? env.SMS_API_URL ?? "").trim();
  const apiKey = (process.env.SMS_API_KEY ?? env.SMS_API_KEY ?? "").trim();
  const senderId = (process.env.SMS_SENDER_ID ?? env.SMS_SENDER_ID ?? "").trim();
  const rawFormat = (process.env.SMS_API_FORMAT ?? env.SMS_API_FORMAT ?? "query")
    .trim()
    .toLowerCase();
  const format = rawFormat === "form" ? "form" : rawFormat === "json" ? "json" : "query";
  const rawAuthHeader = (
    process.env.SMS_AUTH_HEADER ?? String(env.SMS_AUTH_HEADER)
  )
    .trim()
    .toLowerCase();
  const authHeader = rawAuthHeader === "true";
  const rawTemplate = (
    process.env.SMS_MESSAGE_TEMPLATE ?? env.SMS_MESSAGE_TEMPLATE ?? ""
  ).trim();
  const template = rawTemplate || DEFAULT_SMS_TEMPLATE;
  const nodeEnv = (process.env.NODE_ENV ?? env.NODE_ENV ?? "development").trim();

  return {
    apiUrl,
    apiKey,
    senderId,
    format,
    authHeader,
    template,
    nodeEnv,
  };
}

export function isSmsConfigured(): boolean {
  const cfg = getSmsRuntimeConfig();
  return Boolean(cfg.apiUrl && cfg.apiKey);
}

export function toGatewayPhone(phone: string): string | null {
  const cleaned = phone.trim().replace(/[\s-]+/g, "");
  const withoutPlus = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  if (!/^8801[3-9]\d{8}$/.test(withoutPlus)) {
    return null;
  }
  return withoutPlus;
}

export function formatOtpSmsMessage(code: string): string {
  const { template } = getSmsRuntimeConfig();
  return template.replace(/\{code\}/g, code);
}

function maskSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("***");
}

function maskUrlForLog(url: URL, apiKey: string): string {
  const safeUrl = new URL(url.toString());
  if (safeUrl.searchParams.has("api_key")) {
    safeUrl.searchParams.set("api_key", "***");
  }
  if (safeUrl.searchParams.has("apiKey")) {
    safeUrl.searchParams.set("apiKey", "***");
  }
  return maskSecret(`${safeUrl.origin}${safeUrl.pathname}${safeUrl.search}`, apiKey);
}

function extractMessageIdFromJson(obj: Record<string, unknown>): string | undefined {
  const candidateKeys = [
    "campaign_id",
    "campaignId",
    "message_id",
    "messageId",
    "msgid",
    "msg_id",
    "smsid",
    "sms_id",
    "shoot_id",
    "sms_shoot_id",
    "trx_id",
    "trxid",
    "tracking_id",
    "reference",
    "ref_id",
    "request_id",
    "response_id",
    "id",
  ];

  for (const key of candidateKeys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) {
      return val.trim().slice(0, 128);
    }
    if (typeof val === "number" && Number.isFinite(val)) {
      return String(val);
    }
  }

  const nested = obj.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return extractMessageIdFromJson(nested as Record<string, unknown>);
  }

  return undefined;
}

function hasFailureIndicatorText(text: string): boolean {
  return /\b(invalid|insufficient|balance|unauthorized|missing|denied|expired|suspended|blocked|error|failed|fail|rejected|not\s+sent|no\s+access|not\s+a\s+user)\b/i.test(
    text,
  );
}

function hasSuccessIndicatorText(text: string): boolean {
  return /\b(success|successfully|submitted|sent|delivered|queued|accepted)\b/i.test(
    text,
  );
}

function isSuccessGatewayCode(raw: unknown): boolean {
  if (typeof raw === "number") {
    return raw === 200 || raw === 202 || raw === 445000;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (lower === "ok" || lower === "success") return true;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && (numeric === 200 || numeric === 202 || numeric === 445000);
  }
  return false;
}

export function parseGatewayResult(status: number, body: string): SendSmsResult {
  if (status < 200 || status >= 300) {
    return { ok: false, reason: `Gateway HTTP ${status}` };
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: true };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const gatewayMessageId = extractMessageIdFromJson(obj);

      const rawResponseCode = obj.response_code ?? obj.responseCode;
      if (
        rawResponseCode !== undefined &&
        rawResponseCode !== null &&
        String(rawResponseCode).trim() !== ""
      ) {
        const numericCode = Number(rawResponseCode);
        if (numericCode !== 200 && numericCode !== 202) {
          const reason =
            typeof obj.error_message === "string" && obj.error_message.trim()
              ? obj.error_message.trim()
              : typeof obj.message === "string" && obj.message.trim()
                ? obj.message.trim()
                : `Gateway response_code ${rawResponseCode}`;
          return { ok: false, reason };
        }
      }

      if (typeof obj.error_message === "string" && obj.error_message.trim().length > 0) {
        return { ok: false, reason: obj.error_message.trim() };
      }

      if (
        obj.error !== undefined &&
        obj.error !== null &&
        obj.error !== "" &&
        obj.error !== false &&
        obj.error !== 0 &&
        obj.error !== "0"
      ) {
        return {
          ok: false,
          reason: typeof obj.error === "string" ? obj.error : "Gateway returned error",
        };
      }

      if (obj.success === false || String(obj.success).toLowerCase() === "false") {
        const msg =
          typeof obj.message === "string" ? obj.message.trim() : "Gateway reported failure";
        return { ok: false, reason: msg || "Gateway reported failure" };
      }

      if (typeof obj.status === "string") {
        const stLower = obj.status.trim().toLowerCase();
        if (["error", "failed", "fail", "rejected"].includes(stLower)) {
          return {
            ok: false,
            reason:
              typeof obj.message === "string" && obj.message.trim()
                ? obj.message.trim()
                : `Gateway status ${obj.status}`,
          };
        }
      }

      const textFields = [
        obj.message,
        obj.msg,
        obj.description,
        obj.status_message,
        obj.statusText,
        obj.success_message,
      ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

      for (const txt of textFields) {
        if (hasFailureIndicatorText(txt)) {
          return { ok: false, reason: txt.trim() };
        }
      }

      const explicitSuccess =
        isSuccessGatewayCode(rawResponseCode) ||
        obj.success === true ||
        String(obj.success).toLowerCase() === "true" ||
        (typeof obj.status === "string" &&
          ["success", "ok", "sent", "submitted"].includes(obj.status.trim().toLowerCase()));

      const rawCode = obj.code;
      if (rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== "") {
        const isZeroWithSuccessText =
          Number(rawCode) === 0 && textFields.some(hasSuccessIndicatorText);
        if (!isSuccessGatewayCode(rawCode) && !explicitSuccess && !isZeroWithSuccessText) {
          const reason =
            typeof obj.message === "string" && obj.message.trim()
              ? obj.message.trim()
              : `Gateway code ${rawCode}`;
          return { ok: false, reason };
        }
      }

      return { ok: true, ...(gatewayMessageId ? { gatewayMessageId } : {}) };
    }
  } catch {
    // Not JSON — inspect plain-text response
  }

  if (hasFailureIndicatorText(trimmed)) {
    return { ok: false, reason: trimmed.slice(0, 200) };
  }

  const plainIdMatch =
    /(?:id|msgid|message_id|ref)\s*[:=#]\s*([A-Za-z0-9_-]{3,64})/i.exec(trimmed) ??
    /^(?:ok|success)\s*[:|-]\s*([A-Za-z0-9_-]{3,64})$/i.exec(trimmed);

  const gatewayMessageId = plainIdMatch?.[1];
  return { ok: true, ...(gatewayMessageId ? { gatewayMessageId } : {}) };
}

async function performGatewayFetch(
  cfg: SmsRuntimeConfig,
  gatewayPhone: string,
  message: string,
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS);

  try {
    if (cfg.format === "form") {
      const url = new URL(cfg.apiUrl);
      const formParams = new URLSearchParams();
      formParams.set("api_key", cfg.apiKey);
      formParams.set("contacts", gatewayPhone);
      if (cfg.senderId) {
        formParams.set("senderid", cfg.senderId);
      }
      formParams.set("msg", message);

      console.log(
        `[SMS Gateway] POST ${maskUrlForLog(url, cfg.apiKey)} format=form contacts=${gatewayPhone}`,
      );

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(cfg.authHeader ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: formParams.toString(),
        signal: controller.signal,
      });

      const body = await response.text();
      return { status: response.status, body };
    }

    if (cfg.format === "json") {
      const url = new URL(cfg.apiUrl);
      console.log(
        `[SMS Gateway] POST ${maskUrlForLog(url, cfg.apiKey)} format=json number=${gatewayPhone}`,
      );

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.authHeader ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          api_key: cfg.apiKey,
          ...(cfg.senderId ? { senderid: cfg.senderId } : {}),
          number: gatewayPhone,
          message,
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      return { status: response.status, body };
    }

    const url = new URL(cfg.apiUrl);
    url.searchParams.set("api_key", cfg.apiKey);
    url.searchParams.set("contacts", gatewayPhone);
    if (cfg.senderId) {
      url.searchParams.set("senderid", cfg.senderId);
    }
    url.searchParams.set("msg", message);

    console.log(`[SMS Gateway] GET ${maskUrlForLog(url, cfg.apiKey)}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
    });

    const body = await response.text();
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendSms(phone: string, message: string): Promise<SendSmsResult> {
  const gatewayPhone = toGatewayPhone(phone);
  if (!gatewayPhone) {
    return { ok: false, reason: "Invalid Bangladeshi phone number." };
  }

  const cfg = getSmsRuntimeConfig();

  if (!cfg.apiUrl || !cfg.apiKey) {
    if (cfg.nodeEnv === "production") {
      return { ok: false, reason: "SMS gateway is not configured." };
    }

    console.log(`[DEV SMS] To: ${gatewayPhone} | Message: ${message}`);
    return { ok: true, devFallback: true };
  }

  let lastNetworkError = "Network error while contacting SMS gateway.";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { status, body } = await performGatewayFetch(cfg, gatewayPhone, message);
      console.log(
        `[SMS Gateway] status=${status} body=${maskSecret(body, cfg.apiKey).slice(0, 500)}`,
      );
      return parseGatewayResult(status, body);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Fetch error";
      lastNetworkError = maskSecret(errMsg, cfg.apiKey);
      console.error(
        `[SMS Gateway] attempt=${attempt} network/timeout failure: ${lastNetworkError}`,
      );
      // Retry ONCE only on network/timeout errors
    }
  }

  return { ok: false, reason: lastNetworkError };
}
