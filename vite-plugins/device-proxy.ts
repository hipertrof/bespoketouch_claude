import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleDevice, type DeviceEnv } from "../api/_deviceCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only device-pairing proxy: the serverless api/device.ts equivalent while
// running `vite dev`. Needs SUPABASE_SERVICE_ROLE_KEY in the local .env.
export function deviceProxyPlugin(env: DeviceEnv): Plugin {
  return {
    name: "device-pairing-proxy",
    configureServer(server) {
      server.middlewares.use("/api/device", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handleDevice(body, env);
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
