import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handleCrm } from "./_crmCore.js";

// Guest 360 CRM endpoint — authed (manager-and-up), the ONLY read/write path
// to the service-role-only guest CRM tables (see _crmCore for the model).
// Dev equivalent: the Vite middleware in vite-plugins/crm-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    // Lets the guest search resolve a typed phone number to its phone_hash.
    // Optional — without it the search falls back to name-only matching.
    hashSecret: process.env.GUEST_HASH_SECRET ?? "",
  };

  const result = await handleCrm(req.headers.authorization, req.body, env);
  res.status(result.status).json(result.json);
}
