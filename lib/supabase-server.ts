import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase clients. Both use the public anon key, so every query
 * is limited by RLS. The service role key is never used in app code.
 */

function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }
  return { url, anonKey };
}

let catalogClient: SupabaseClient<Database> | null = null;

/**
 * Session-less client for catalog reads (public.movies, movie_genres). It
 * never touches cookies(), so pages that only read the catalog stay static
 * and keep their `revalidate`.
 */
export function getCatalogClient(): SupabaseClient<Database> {
  if (catalogClient) return catalogClient;
  const { url, anonKey } = supabaseEnv();
  catalogClient = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
  return catalogClient;
}

/**
 * Client bound to the request's auth cookies, for server code that needs to
 * know who is signed in. Calling it makes the route dynamic.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies; middleware.ts refreshes the
          // session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
