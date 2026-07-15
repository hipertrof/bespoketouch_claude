import type { VercelRequest, VercelResponse } from "@vercel/node";
// Extensionless import: this file is bundled by Vercel's esbuild (not the local
// tsc project), which resolves the sibling .ts source without an extension.
import { addMember } from "../server/membersCore";

// Member-invite endpoint. Keeps SUPABASE_SERVICE_ROLE_KEY server-side and does
// its own caller auth (see membersCore). The dev equivalent is the Vite
// middleware in vite-plugins/members-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };

  const result = await addMember(req.headers.authorization, req.body, env);
  res.status(result.status).json(result.json);
}
