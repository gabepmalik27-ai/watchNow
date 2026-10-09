/**
 * Every weight, threshold and lookup table the recommender uses. Nothing in
 * lib/recommender/ hardcodes a number; docs/RECOMMENDER.md explains each one.
 */

// ─── Taste profile (profile.ts) ─────────────────────────────────────────────

/** Rating the user's mean is shrunk toward: the middle of the 0.5–5 scale, nudged up because people mostly rate movies they chose to watch. */
export const MU_PRIOR = 3.5;
/** Pseudo-ratings of MU_PRIOR added to the user's mean: mu = (Σr + 3.5·2) / (n + 2). */
export const MU_PRIOR_COUNT = 2;

/** Base weight of a watched but unrated movie. */
export const WEIGHT_WATCHED_UNRATED = 0.3;
/** Base weight of a movie on the watchlist (and not watched). */
export const WEIGHT_WATCHLIST = 0.5;
/** Base weight of a movie marked "not interested". */
export const WEIGHT_NOT_INTERESTED = -1.0;

/** A signal loses half its weight every this many days since updated_at. */
export const RECENCY_HALF_LIFE_DAYS = 180;
export const MS_PER_DAY = 86_400_000;

/** Pseudo-count in each affinity denominator: A[t] = Σw / (count + 2). */
export const AFFINITY_PSEUDO_COUNT = 2;
/** A cast member gets this share of a movie's weight (directors and keywords get 1). */
export const CAST_WEIGHT = 0.5;
/** Only the first N billed cast members count. */
export const TOP_CAST_COUNT = 3;
/** pUser when the user has no positively weighted movies. */
export const DEFAULT_RARITY_PREFERENCE = 0.5;

// ─── Candidate features (features.ts) ───────────────────────────────────────

/** m in the Bayesian weighted rating: votes needed before R counts as much as the pool mean. */
export const BAYES_MIN_VOTES = 1000;
/** Weighted rating mapped to quality 0. */
export const QUALITY_FLOOR = 5;
/** Weighted rating mapped to quality 1. */
export const QUALITY_CEIL = 9;

// ─── Scoring (score.ts) ─────────────────────────────────────────────────────

export const FEATURES = ["context", "keyword", "genre", "people", "quality", "rarity"] as const;
export type FeatureName = (typeof FEATURES)[number];
export type WeightSet = Readonly<Record<FeatureName, number>>;

/** Features that need a taste profile; zeroed during cold start. */
export const PERSONAL_FEATURES: readonly FeatureName[] = ["keyword", "genre", "people"];

export const FOR_YOU_WEIGHTS: WeightSet = {
  context: 0,
  keyword: 0.35,
  genre: 0.25,
  people: 0.15,
  quality: 0.15,
  rarity: 0.1,
};

export const RECOMMEND_WEIGHTS: WeightSet = {
  context: 0.4,
  keyword: 0.15,
  genre: 0.12,
  people: 0.08,
  quality: 0.15,
  rarity: 0.1,
};

/** Below this many ratings, keyword/genre/people weights are zeroed. */
export const COLD_START_MIN_RATINGS = 3;
/** Below this many ratings, the UI asks the user to rate more. */
export const PERSONALIZE_PROMPT_RATINGS = 5;
/** For You / Home: at most this many results per director. */
export const MAX_PER_DIRECTOR = 2;

// ─── Pool and result sizes ──────────────────────────────────────────────────

/** Candidates: the N most-voted movies. */
export const POOL_SIZE = 2000;
/** PostgREST returns at most 1000 rows per request. */
export const POOL_PAGE_SIZE = 1000;
export const FOR_YOU_LIMIT = 20;
export const RECOMMEND_LIMIT = 5;

// ─── Context (context.ts) ───────────────────────────────────────────────────

export const MOODS = ["Funny", "Exciting", "Relaxing"] as const;
export type Mood = (typeof MOODS)[number];
export const EXPERIENCES = ["Easy", "Engaging", "Intense"] as const;
export type Experience = (typeof EXPERIENCES)[number];
export const TIMES = ["<90", "90–120", "2+ hours"] as const;
export type TimeOption = (typeof TIMES)[number];

export type ContextProfile = {
  genres: readonly string[];
  /** Lowercase TMDB keyword names; any match counts as one extra hit. */
  keywords: readonly string[];
  /** Each of these genres on a movie subtracts CONTEXT_PENALTY_PER_GENRE. */
  penalize: readonly string[];
};

export const MOOD_PROFILES: Readonly<Record<Mood, ContextProfile>> = {
  Funny: {
    genres: ["Comedy", "Animation", "Family"],
    keywords: ["parody", "satire", "slapstick comedy", "buddy comedy"],
    penalize: [],
  },
  Exciting: {
    genres: ["Action", "Adventure", "Thriller", "Science Fiction"],
    keywords: ["heist", "car chase", "superhero", "chase"],
    penalize: [],
  },
  Relaxing: {
    genres: ["Comedy", "Family", "Animation", "Romance", "Documentary"],
    keywords: ["feel-good", "friendship", "road trip"],
    penalize: ["Horror", "War", "Thriller"],
  },
};

export const EXPERIENCE_PROFILES: Readonly<Record<Experience, ContextProfile>> = {
  Easy: {
    genres: ["Comedy", "Family", "Animation", "Romance"],
    keywords: ["feel-good", "coming of age"],
    penalize: [],
  },
  Engaging: {
    genres: ["Drama", "Mystery", "Science Fiction", "History"],
    keywords: ["twist ending", "plot twist", "based on true story", "philosophy"],
    penalize: [],
  },
  Intense: {
    genres: ["Thriller", "Horror", "War", "Crime"],
    keywords: ["survival", "serial killer", "revenge", "psychological thriller"],
    penalize: [],
  },
};

/** Inclusive runtime bounds in minutes (null = unbounded) and the label used in reasons. */
export const TIME_RANGES: Readonly<
  Record<TimeOption, { min: number | null; max: number | null; label: string }>
> = {
  "<90": { min: null, max: 90, label: "Under 90 min" },
  "90–120": { min: 90, max: 120, label: "90–120 min" },
  "2+ hours": { min: 120, max: null, label: "2+ hours" },
};

/** Genre/keyword hits in one dimension that count as a full match. */
export const CONTEXT_HITS_FOR_FULL_MATCH = 2;
/** Subtracted from contextMatch per penalized genre the movie has. */
export const CONTEXT_PENALTY_PER_GENRE = 0.5;
/** Discovery slider: 0 = Safe Pick, 100 = Surprise Me. */
export const DISCOVERY_MIN = 0;
export const DISCOVERY_MAX = 100;
export const DISCOVERY_DEFAULT = 50;

// ─── Explanations (explain.ts) ──────────────────────────────────────────────

/** Shared keywords/genres named in a "Because you loved …" reason. */
export const EXPLAIN_SHARED_TERMS = 2;
export const REASON_COLD_START = "Popular and highly rated";
