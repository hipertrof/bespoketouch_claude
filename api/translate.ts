import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handleTranslate } from "./_translateCore.js";

// Production DeepL proxy — the serverless replacement for the dev-only Vite
// middleware in `vite-plugins/deepl-proxy.ts`. Keeps DEEPL_API_KEY server-side,
// out of the client bundle, and requires a staff JWT or a paired device token
// (see _translateCore). The client (`src/i18n/translateNote.ts`) POSTs here at
// `/api/translate`; the same path is served by the Vite plugin during `vite dev`.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = {
    deeplKey: process.env.DEEPL_API_KEY ?? "",
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };

  const result = await handleTranslate(req.headers.authorization, req.body, env);
  res.status(result.status).json(result.json);
}
