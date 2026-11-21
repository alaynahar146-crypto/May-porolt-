import { DEVICE_ID_KEY, USED_CODES_KEY } from "../constants";

export function getOrCreateDeviceId(): number {
  try {
    const raw = localStorage.getItem(DEVICE_ID_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isInteger(parsed) && parsed >= 1000 && parsed <= 9999999999) {
        return parsed;
      }
    }
  } catch {}

  let generated = 0;
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      generated = 10000000 + (buf[0] % 90000000);
    }
  } catch {}

  if (!generated) {
    generated = Math.floor(10000000 + Math.random() * 90000000);
  }

  try {
    localStorage.setItem(DEVICE_ID_KEY, String(generated));
  } catch {}
  return generated;
}

export function getUsedCodes(): string[] {
  try {
    const raw = localStorage.getItem(USED_CODES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((c) => String(c).toUpperCase()) : [];
  } catch {
    return [];
  }
}

export function markCodeAsUsed(code: string): void {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  const current = getUsedCodes();
  if (!current.includes(normalized)) {
    const next = [normalized, ...current].slice(0, 100);
    try {
      localStorage.setItem(USED_CODES_KEY, JSON.stringify(next));
    } catch {}
  }
}

function toAsciiDigits(str: string): string {
  return str
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function cleanInvisibleAndDashes(str: string): string {
  return toAsciiDigits(str)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212\u0640]/g, "-");
}

export function extractActivationCode(input: string): string {
  const cleaned = cleanInvisibleAndDashes(input).trim();
  if (!cleaned) return "";

  const structuredMatch = cleaned.match(/\b([BPY]S?)\s*-?\s*(\d{3,10})\b/i);
  if (structuredMatch) {
    return `${structuredMatch[1].toUpperCase()}-${structuredMatch[2]}`;
  }

  if (/[\s\u0600-\u06FF]/.test(cleaned)) {
    const afterColon = cleaned.match(/:\s*([A-Za-z0-9][A-Za-z0-9_-]{2,23})/);
    if (afterColon) {
      return afterColon[1].toUpperCase();
    }
    const tokens = cleaned.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,23}/g);
    if (tokens && tokens.length > 0) {
      return tokens[0].toUpperCase();
    }
  }

  return cleaned.toUpperCase().replace(/\s+/g, "");
}

export function normalizeCode(input: string): string {
  const extracted = extractActivationCode(input);
  if (!extracted) return "";

  const deviceNoDash = extracted.match(/^([BPY])(\d{3,10})$/);
  if (deviceNoDash) {
    return `${deviceNoDash[1]}-${deviceNoDash[2]}`;
  }

  const instantNoDash = extracted.match(/^([BPY]S)(\d{3,10})$/);
  if (instantNoDash) {
    return `${instantNoDash[1]}-${instantNoDash[2]}`;
  }

  return extracted;
}
