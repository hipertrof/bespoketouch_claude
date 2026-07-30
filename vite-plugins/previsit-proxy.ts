import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handlePrevisit, type PrevisitEnv } from "../api/_previsitCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only pre-visit link proxy: the serverless api/previsit.ts equivalent while
// running `vite dev`. Needs SUPABASE_SERVICE_ROLE_KEY and GUEST_HASH_SECRET in
// the local .env (the same secrets Vercel uses in production) — without them
// every action returns "missing config", like the other service-role endpoints.
export function previsitProxyPlugin(env: PrevisitEnv): Plugin {
  return {
    name: "previsit-proxy",
    configureServer(server) {
      server.middlewares.use("/api/previsit", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handlePrevisit(req.headers.authorization, body, env);
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
