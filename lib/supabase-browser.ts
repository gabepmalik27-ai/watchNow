import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Supabase client for client components. Anon key only; the session lives in
 * the auth cookies @supabase/ssr manages, and RLS limits every query to the
 * signed-in user's rows. createBrowserClient returns a singleton in the browser.
 */
export function getSupabaseBrowser(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
