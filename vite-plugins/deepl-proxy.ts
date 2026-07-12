import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only DeepL proxy: keeps the API key server-side, out of the client bundle.
// Only wired up while running `vite dev` — a static production build would need
// a real serverless function (Vercel/Netlify/etc.) to replace this middleware.
export function deeplProxyPlugin(apiKey: string | undefined): Plugin {
  return {
    name: "deepl-translate-proxy",
    configureServer(server) {
      server.middlewares.use("/api/translate", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        res.setHeader("Content-Type", "application/json");

        if (!apiKey) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error:
                "DEEPL_API_KEY is not set. Add it to a .env file at the project root (see .env.example) and restart the dev server.",
            }),
          );
          return;
        }

        try {
          const raw = await readBody(req);
          const { text, targetLang, sourceLang } = JSON.parse(raw) as {
            text: string;
            targetLang: string;
            sourceLang?: string;
          };

          if (!text || !targetLang) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing text or targetLang" }));
            return;
          }

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
            res.statusCode = deeplRes.status;
            res.end(JSON.stringify({ error: `DeepL API error: ${errText}` }));
            return;
          }

          const data = (await deeplRes.json()) as {
            translations: { text: string }[];
          };

          res.statusCode = 200;
          res.end(JSON.stringify({ translatedText: data.translations[0]?.text ?? "" }));
        } catch (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
          );
        }
      });
    },
  };
}
