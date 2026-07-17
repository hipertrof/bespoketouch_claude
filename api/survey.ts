import type { VercelRequest, VercelResponse } from "@vercel/node";
// Explicit .js extension: Vercel runs this as ESM (package.json "type":"module")
// without bundling, and Node ESM requires the extension on relative imports.
import { handleSurvey } from "./_surveyCore.js";

// Post-treatment survey endpoint. No login, but device-token authenticated: the
// kiosk presents its token and the server derives the location (see
// _surveyCore). Dev equivalent: vite-plugins/survey-proxy.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const env = {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };

  const result = await handleSurvey(req.body, env);
  res.status(result.status).json(result.json);
}
