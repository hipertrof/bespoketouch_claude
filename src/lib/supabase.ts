import { createClient } from "@supabase/supabase-js";

// Browser Supabase client. Uses the public anon key + Row-Level Security for
// all access control — never the service-role key on the client.
// Values come from Vite env (VITE_* is exposed to the client bundle by design;
// the anon key is safe to ship, RLS is the real boundary).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail loud in dev; in prod the app shells that need Supabase should guard on this.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Backend features (auth, dashboards, CRM, survey) will not work until configured.",
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "");
