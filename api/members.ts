import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { addMember, removeMember } from "./_membersCore.js";

// Member-invite endpoint. Keeps SUPABASE_SERVICE_ROLE_KEY server-side and does
// its own caller auth (see membersCore). The dev equivalent is the Vite
// middleware in vite-plugins/members-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin =
    (req.headers.origin as string | undefined) ??
    (req.headers.host ? `https://${req.headers.host}` : undefined);
  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    appUrl: origin,
  };

  if (req.method === "DELETE") {
    const id = (req.body?.membershipId as string | undefined) ?? undefined;
    const r = await removeMember(req.headers.authorization, id, env);
    res.status(r.status).json(r.json);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const result = await addMember(req.headers.authorization, req.body, env);
  res.status(result.status).json(result.json);
}
