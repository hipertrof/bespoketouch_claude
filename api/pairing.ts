import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM without bundling.
import { handlePairing } from "./_pairingCore.js";

// Manager pairing endpoint. action: createSlot|repair|revoke. Authorizes the
// caller from their JWT (service-role key stays server-side) and enforces the
// hard slot cap + re-pair rate limit. Dev equivalent: vite-plugins/pairing-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
  const result = await handlePairing(req.headers.authorization, req.body, env);
  res.status(result.status).json(result.json);
}
