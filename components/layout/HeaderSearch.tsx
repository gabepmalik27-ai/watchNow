"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/lib/cx";
import { formatMatchHint } from "@/lib/format";
import { useMovieDetail } from "@/lib/movie-detail";
import { useMovieSearch } from "@/lib/use-movie-search";
import type { SearchResult } from "@/types/movie";

const MAX_SUGGESTIONS = 5;
const SEARCH_DELAY_MS = 200;
const SKELETON_ROWS = 3;
const SEE_ALL_KEY = "all";

type SuggestionOption = { key: string; movie: SearchResult | null };

/**
 * Desktop header search: a WAI-ARIA combobox with a listbox of the top five
 * matches. Focus stays in the input; the highlighted option is exposed with
 * aria-activedescendant. Tablet and mobile use the icon button in Header.
 */
export function HeaderSearch() {
  const router = useRouter();
  const { openMovie } = useMovieDetail();
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const trimmed = query.trim();
  const search = useMovieSearch(query, null, SEARCH_DELAY_MS);
  // Results only count once they belong to what's in the box right now.
  const settled =
    search.query === trimmed && (search.status === "done" || search.status === "error");
  const failed = settled && search.status === "error";
  const movies = settled && !failed ? search.results.slice(0, MAX_SUGGESTIONS) : [];

  // "See all results" is always the last option, even while loading or empty.
  const options: SuggestionOption[] = [
    ...movies.map((movie) => ({ key: `movie-${movie.id}`, movie })),
    { key: SEE_ALL_KEY, movie: null },
  ];
  const visible = open && trimmed.length > 0;
  // Tracked by key, not index, so results arriving can't move the highlight.
  const activeIndex = options.findIndex((option) => option.key === activeKey);
  const active = visible && activeIndex >= 0 ? options[activeIndex] : null;

  const optionId = (key: string) => `${uid}-option-${key}`;

  const announcement = !visible || !settled
    ? ""
    : failed
      ? "Search unavailable"
      : movies.length === 0
        ? "No results"
        : `${movies.length} ${movies.length === 1 ? "result" : "results"}`;

  function close() {
    setOpen(false);
    setActiveKey(null);
  }

  function showAllResults() {
    close();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  function choose(option: SuggestionOption) {
    if (option.movie) {
      close();
      openMovie(option.movie, inputRef.current ?? undefined);
    } else {
      showAllResults();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (!trimmed) return;
        event.preventDefault();
        if (!visible) {
          setOpen(true);
          return;
        }
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next =
          activeIndex === -1
            ? step === 1
              ? 0
              : options.length - 1
            : (activeIndex + step + options.length) % options.length;
        setActiveKey(options[next].key);
        return;
      }
      case "Enter":
        event.preventDefault();
        if (active) choose(active);
        else showAllResults();
        return;
      case "Escape":
        if (visible) {
          event.preventDefault();
          close();
        } else if (query) {
          event.preventDefault();
          setQuery("");
        }
        return;
    }
  }

  return (
    <div className="relative hidden desktop:block">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Search WatchNow"
        aria-expanded={visible}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active ? optionId(active.key) : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Search movies, people..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveKey(null);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={close}
        className="h-11 w-56 rounded-full border border-border bg-panel px-4 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
      />

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {visible ? (
        <div
          // Keep focus in the input while the pointer is on the panel.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute right-0 top-full z-50 mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-panel"
        >
          {!settled ? (
            <div aria-hidden="true" className="flex flex-col gap-2 p-2">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : failed ? (
            <p className="px-4 py-4 text-sm text-muted">Search unavailable</p>
          ) : movies.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              No matches. Press Enter to search &quot;{trimmed}&quot;
            </p>
          ) : null}

          <ul
            id={listboxId}
            role="listbox"
            aria-label="Search suggestions"
            className="flex flex-col p-2"
          >
            {options.map((option) => {
              const selected = active?.key === option.key;
              return (
                <li
                  key={option.key}
                  id={optionId(option.key)}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => {
                    if (!selected) setActiveKey(option.key);
                  }}
                  onClick={() => choose(option)}
                  className={cx(
                    "flex min-h-11 cursor-pointer items-center gap-4 rounded-lg px-2 py-2",
                    selected ? "bg-raised ring-2 ring-inset ring-electric" : "",
                  )}
                >
                  {option.movie ? (
                    <MovieOptionContent movie={option.movie} />
                  ) : (
                    <span className="px-2 text-sm font-semibold text-soft-blue">
                      See all results for &quot;{trimmed}&quot;
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MovieOptionContent({ movie }: { movie: SearchResult }) {
  const hint = formatMatchHint(movie);
  const detail = [movie.release_year, hint].filter((part) => part !== null).join(" · ");
  return (
    <>
      <div aria-hidden="true" className="w-10 shrink-0">
        <PosterBlock movie={movie} sizes="40px" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{movie.title}</p>
        {detail ? <p className="truncate text-xs text-muted">{detail}</p> : null}
      </div>
    </>
  );
}
