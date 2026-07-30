import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handlePrevisit } from "./_previsitCore.js";

// Pre-visit intake link endpoint. Two authorization styles in one route (see
// _previsitCore for the model): staff actions (create/list/revoke/convert) take
// the caller's JWT and self-authorize against memberships; the guest-facing
// actions (lookup/save) are anonymous and credentialled by the link code plus
// the phone the spa recorded at booking.
// Dev equivalent: the Vite middleware in vite-plugins/previsit-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    // Required, not optional: the phone hash is half the credential on every
    // guest-facing action, and the subject_ref written at mint time.
    hashSecret: process.env.GUEST_HASH_SECRET ?? "",
  };

  const result = await handlePrevisit(req.headers.authorization, req.body, env);
  res.status(result.status).json(result.json);
}
