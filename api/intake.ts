import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handleIntake } from "./_intakeCore.js";

// Kiosk intake-write endpoint. Anonymous in the sense that there is no login,
// but NOT unauthenticated: the tablet must present its paired device token and
// the server derives the location from it (see _intakeCore for the model). This
// replaces the anon RLS insert bridge dropped in migration 0012. Dev equivalent:
// the Vite middleware in vite-plugins/intake-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };

  const result = await handleIntake(req.body, env);
  res.status(result.status).json(result.json);
}
