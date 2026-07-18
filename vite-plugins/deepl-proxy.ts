import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleTranslate, type TranslateEnv } from "../api/_translateCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only DeepL proxy: the serverless api/translate.ts equivalent while running
// `vite dev`. Shares _translateCore so auth (staff JWT or device token), the
// length cap, and error shapes match prod. Needs DEEPL_API_KEY plus the Supabase
// URL + service key in the local .env to validate callers.
export function deeplProxyPlugin(env: TranslateEnv): Plugin {
  return {
    name: "deepl-translate-proxy",
    configureServer(server) {
      server.middlewares.use("/api/translate", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handleTranslate(req.headers.authorization, body, env);
          res.statusCode = result.status;
          res.end(JSON.stringify(result.json));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }));
        }
      });
    },
  };
}
