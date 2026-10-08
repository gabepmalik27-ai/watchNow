"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cx } from "@/lib/cx";
import { NAV_ITEMS } from "@/lib/nav-items";

function PlayMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric"
    >
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
        <path d="M0 0L12 7L0 14V0Z" fill="var(--text)" />
      </svg>
    </span>
  );
}

function Logo() {
  return (
    <Link
      href="/"
      aria-label="WatchNow home"
      className="flex shrink-0 items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-navigation"
    >
      <PlayMark />
      <span className="text-lg font-bold text-text">
        Watch<span className="text-electric">Now</span>
      </span>
    </Link>
  );
}

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="hidden items-center gap-1 tablet:flex"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-navigation",
              active
                ? "bg-electric font-semibold text-text"
                : "text-muted hover:bg-raised hover:text-text",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SearchIconButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={() => router.push("/search")}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-panel text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-navigation desktop:hidden"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11.5 11.5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function SearchInputFull() {
  const router = useRouter();
  return (
    <input
      type="search"
      placeholder="Search..."
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          router.push("/search");
        }
      }}
      className="hidden h-11 w-56 rounded-full border border-border bg-panel px-4 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric desktop:block"
    />
  );
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-navigation";

function AccountMenu({
  name,
  email,
  onSignOut,
}: {
  name: string;
  email: string | null;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        // Close when focus leaves the trigger and panel (e.g. Tab past "Sign out").
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Account menu for ${name}`}
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-raised text-sm font-semibold text-text transition-colors hover:border-electric",
          open ? "border-electric" : "border-border",
          FOCUS_RING,
        )}
      >
        <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
      </button>
      {open ? (
        <div
          id="account-menu"
          className="absolute right-0 top-full z-50 mt-2 flex w-64 flex-col gap-2 rounded-xl border border-border bg-raised p-2"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-text">{name}</p>
            {email ? <p className="truncate text-xs text-muted">{email}</p> : null}
          </div>
          <button
            type="button"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await onSignOut();
              } finally {
                setSigningOut(false);
                setOpen(false);
              }
            }}
            className={cx(
              "min-h-11 rounded-lg px-3 text-left text-sm font-medium text-text transition-colors hover:bg-panel disabled:cursor-wait disabled:opacity-70",
              FOCUS_RING,
            )}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AccountControl({ pathname }: { pathname: string }) {
  const { status, user, displayName, signOut } = useAuth();

  if (status === "loading" || (status === "signed-in" && !displayName)) {
    // Same footprint as the avatar, so the header doesn't shift once auth resolves.
    return (
      <div
        aria-hidden="true"
        className="h-11 w-11 shrink-0 rounded-full border border-border bg-panel"
      />
    );
  }

  if (status === "signed-out" || !user || !displayName) {
    const next = pathname === "/login" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return (
      <Link
        href={`/login${next}`}
        className={cx(
          "inline-flex min-h-11 shrink-0 items-center rounded-full bg-electric px-5 text-sm font-semibold text-text transition-colors hover:bg-soft-blue",
          FOCUS_RING,
        )}
      >
        Sign in
      </Link>
    );
  }

  return <AccountMenu name={displayName} email={user.email} onSignOut={signOut} />;
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-navigation">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 tablet:gap-6 tablet:px-8 desktop:px-[72px]">
        <Logo />
        <DesktopNav pathname={pathname} />
        <div className="ml-auto flex items-center gap-3">
          <SearchIconButton />
          <SearchInputFull />
          <AccountControl pathname={pathname} />
        </div>
      </div>
    </header>
  );
}
