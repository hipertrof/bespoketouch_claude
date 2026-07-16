import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handleGuest } from "./_guestCore.js";

// Opt-in guest CRM endpoint. Keeps GUEST_HASH_SECRET + SUPABASE_SERVICE_ROLE_KEY
// server-side; the kiosk calls it anonymously with a location + raw phone (see
// _guestCore for the auth/privacy model). Dev equivalent: the Vite middleware in
// vite-plugins/guest-proxy.ts. All actions are POST with an "action" field.
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

  const result = await handleGuest(req.body, env);
  res.status(result.status).json(result.json);
}
