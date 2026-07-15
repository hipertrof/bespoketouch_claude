import type { VercelRequest, VercelResponse } from "@vercel/node";

// Production DeepL proxy — the serverless replacement for the dev-only Vite
// middleware in `vite-plugins/deepl-proxy.ts`. Keeps DEEPL_API_KEY server-side,
// out of the client bundle. The client (`src/i18n/translateNote.ts`) POSTs here
// at `/api/translate`; the same path is served by the Vite plugin during `vite dev`.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "DEEPL_API_KEY is not set in the deployment environment.",
    });
    return;
  }

  try {
    const { text, targetLang, sourceLang } = (req.body ?? {}) as {
      text?: string;
      targetLang?: string;
      sourceLang?: string;
    };

    if (!text || !targetLang) {
      res.status(400).json({ error: "Missing text or targetLang" });
      return;
    }

    // Free-tier keys end in ":fx" and use the free API host.
    const isFreeKey = apiKey.endsWith(":fx");
    const base = isFreeKey ? "https://api-free.deepl.com" : "https://api.deepl.com";

    const deeplRes = await fetch(`${base}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        target_lang: targetLang,
        source_lang: sourceLang,
      }),
    });

    if (!deeplRes.ok) {
      const errText = await deeplRes.text();
      res.status(deeplRes.status).json({ error: `DeepL API error: ${errText}` });
      return;
    }

    const data = (await deeplRes.json()) as { translations: { text: string }[] };
    res.status(200).json({ translatedText: data.translations[0]?.text ?? "" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}
