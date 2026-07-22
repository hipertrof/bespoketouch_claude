import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handleCheckin } from "./_checkinCore.js";

// QR self-check-in endpoint. "mint" is device-token-authed (the paired kiosk);
// "lookup"/"save" are anonymous, authorized by the short-lived code embedded in
// the QR instead (see _checkinCore for the full trust model). Dev equivalent:
// the Vite middleware in vite-plugins/checkin-proxy.ts. All actions are POST
// with an "action" field.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    hashSecret: process.env.GUEST_HASH_SECRET ?? "",
  };

  const result = await handleCheckin(req.body, env);
  res.status(result.status).json(result.json);
}
