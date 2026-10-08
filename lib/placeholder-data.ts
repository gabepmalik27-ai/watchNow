import type { UserProfile } from "@/types/movie";

/**
 * Static display numbers for the signed-in placeholder user. A fixture,
 * not a data layer: these become real once accounts exist. Movies come
 * from the Supabase catalog (lib/catalog.ts).
 */
export const placeholderProfile: UserProfile = {
  name: "Jamie",
  watched_count: 182,
  rated_count: 126,
  average_rating: 4.1,
  watchlist_count: 24,
};
