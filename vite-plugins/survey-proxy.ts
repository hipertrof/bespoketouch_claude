import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleSurvey, type SurveyEnv } from "../api/_surveyCore.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Dev-only survey proxy: the serverless api/survey.ts equivalent while running
// `vite dev`. Needs SUPABASE_SERVICE_ROLE_KEY in the local .env to reach the DB.
export function surveyProxyPlugin(env: SurveyEnv): Plugin {
  return {
    name: "survey-proxy",
    configureServer(server) {
      server.middlewares.use("/api/survey", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await handleSurvey(body, env);
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
