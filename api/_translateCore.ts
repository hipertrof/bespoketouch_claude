// Shared logic for the DeepL translation endpoint, used by both the Vercel
// serverless function (api/translate.ts) and the dev Vite middleware
// (vite-plugins/deepl-proxy.ts). Keeps DEEPL_API_KEY server-side.
//
// Dependency-free plain fetch, mirroring the other cores. Underscore-prefixed so
// Vercel bundles it without routing it.
//
// AUTH: translating a guest's free-text note is a privileged, metered action —
// it spends DeepL quota and reveals note content to a third party. It is reached
// from two authenticated surfaces: the staff queue (a signed-in therapist/
// manager JWT) and the on-kiosk therapist panel (a paired device token). So the
// endpoint accepts EITHER credential and rejects anonymous callers, closing the
// open relay that let anyone drain the quota.

import { resolveDevice, type DeviceAuthEnv } from "./_deviceAuth.js";

export interface TranslateEnv extends DeviceAuthEnv {
  deeplKey: string;
}

export interface TranslateResult {
  status: number;
  json: unknown;
}

interface TranslateBody {
  text?: unknown;
  targetLang?: unknown;
  sourceLang?: unknown;
  // Kiosk credential (staff callers authenticate with a Bearer JWT instead).
  deviceToken?: unknown;
}

// A guest note is a few sentences per zone; this only stops payloads that exist
// to burn quota, not real input.
const MAX_TEXT_CHARS = 2000;

export async function handleTranslate(
  authorization: string | undefined,
  body: TranslateBody | undefined,
  env: TranslateEnv,
): Promise<TranslateResult> {
  if (!env.deeplKey) {
    return { status: 500, json: { error: "DEEPL_API_KEY is not set in the deployment environment." } };
  }
  if (!env.url || !env.serviceKey) {
    return { status: 500, json: { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY is missing." } };
  }

  const authorized = await isAuthorized(authorization, body, env);
  if (!authorized) {
    return { status: 401, json: { error: "Not authorized to translate." } };
  }

  const text = typeof body?.text === "string" ? body.text : "";
  const targetLang = typeof body?.targetLang === "string" ? body.targetLang : "";
  const sourceLang = typeof body?.sourceLang === "string" ? body.sourceLang : undefined;
  if (!text || !targetLang) {
    return { status: 400, json: { error: "Missing text or targetLang" } };
  }
  if (text.length > MAX_TEXT_CHARS) {
    return { status: 413, json: { error: "Text too long to translate." } };
  }

  // Free-tier keys end in ":fx" and use the free API host.
  const isFreeKey = env.deeplKey.endsWith(":fx");
  const deeplBase = isFreeKey ? "https://api-free.deepl.com" : "https://api.deepl.com";

  const deeplRes = await fetch(`${deeplBase}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${env.deeplKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: [text], target_lang: targetLang, source_lang: sourceLang }),
  });

  if (!deeplRes.ok) {
    const errText = await deeplRes.text().catch(() => "");
    return { status: deeplRes.status, json: { error: `DeepL API error: ${errText}` } };
  }

  const data = (await deeplRes.json().catch(() => null)) as { translations?: { text: string }[] } | null;
  return { status: 200, json: { translatedText: data?.translations?.[0]?.text ?? "" } };
}

// Either a valid staff JWT (Authorization: Bearer) or a valid paired device
// token authorizes the call. Both are the same surfaces that render the note in
// the first place.
async function isAuthorized(
  authorization: string | undefined,
  body: TranslateBody | undefined,
  env: TranslateEnv,
): Promise<boolean> {
  const jwt = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (jwt) {
    const base = env.url.replace(/\/$/, "");
    const r = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${jwt}` },
    });
    if (r.ok) {
      const u = (await r.json().catch(() => null)) as { id?: unknown } | null;
      if (u && typeof u.id === "string") return true;
    }
  }

  if (typeof body?.deviceToken === "string") {
    const device = await resolveDevice(body.deviceToken, env);
    if (device) return true;
  }

  return false;
}
