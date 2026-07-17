import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleIntake, type IntakeEnv } from "../api/_intakeCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only intake-write proxy: the serverless api/intake.ts equivalent while
// running `vite dev`. Needs SUPABASE_SERVICE_ROLE_KEY in the local .env to reach
// the DB (the same secret Vercel uses in prod).
export function intakeProxyPlugin(env: IntakeEnv): Plugin {
  return {
    name: "kiosk-intake-proxy",
    configureServer(server) {
      server.middlewares.use("/api/intake", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handleIntake(body, env);
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
