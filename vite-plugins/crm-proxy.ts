import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleCrm } from "../api/_crmCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

interface CrmProxyEnv {
  url: string;
  serviceKey: string;
}

// Dev-only Guest 360 CRM proxy: the serverless api/crm.ts equivalent while
// running `vite dev`. Needs SUPABASE_SERVICE_ROLE_KEY in the local .env (same
// secret Vercel uses in production).
export function crmProxyPlugin(env: CrmProxyEnv): Plugin {
  return {
    name: "guest-crm-proxy",
    configureServer(server) {
      server.middlewares.use("/api/crm", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handleCrm(req.headers.authorization, body, env);
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
