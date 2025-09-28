// src/lib/supabaseServer.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey) {
  console.warn("[supabase] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
