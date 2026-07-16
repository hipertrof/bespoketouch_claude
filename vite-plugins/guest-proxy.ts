import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleGuest, type GuestEnv } from "../api/_guestCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only guest-CRM proxy: the serverless api/guest.ts equivalent while running
// `vite dev`. Needs GUEST_HASH_SECRET + SUPABASE_SERVICE_ROLE_KEY in the local
// .env to hash phones and reach the DB (same secrets Vercel uses in prod).
export function guestProxyPlugin(env: GuestEnv): Plugin {
  return {
    name: "guest-crm-proxy",
    configureServer(server) {
      server.middlewares.use("/api/guest", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handleGuest(body, env);
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
