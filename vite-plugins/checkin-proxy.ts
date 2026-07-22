import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleCheckin, type CheckinEnv } from "../api/_checkinCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only QR check-in proxy: the serverless api/checkin.ts equivalent while
// running `vite dev`. Needs GUEST_HASH_SECRET + SUPABASE_SERVICE_ROLE_KEY in
// the local .env (same secrets Vercel uses in prod).
export function checkinProxyPlugin(env: CheckinEnv): Plugin {
  return {
    name: "checkin-proxy",
    configureServer(server) {
      server.middlewares.use("/api/checkin", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handleCheckin(body, env);
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
