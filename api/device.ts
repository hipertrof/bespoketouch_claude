import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handleDevice } from "./_deviceCore.js";

// Anonymous device-pairing endpoint (kiosk-facing). action: pair|validate|
// heartbeat. Keeps SUPABASE_SERVICE_ROLE_KEY server-side; no caller JWT — the
// 6-digit code / opaque token are the credentials. Dev equivalent:
// vite-plugins/device-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
  const result = await handleDevice(req.body, env);
  res.status(result.status).json(result.json);
}
