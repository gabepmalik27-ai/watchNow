"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { Panel } from "@/components/ui/Panel";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/TextField";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Mode = "sign-in" | "sign-up";

const TABS: TabItem[] = [
  { id: "sign-in", label: "Sign in" },
  { id: "sign-up", label: "Create account" },
];

const MIN_PASSWORD = 8;
const MAX_DISPLAY_NAME = 50;

type FieldErrors = Partial<Record<"displayName" | "email" | "password", string>>;

/** Supabase's auth messages, reworded for people. Unknown messages pass through. */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (lower.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (lower.includes("failed to fetch")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  return message;
}

function validate(mode: Mode, displayName: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "sign-up") {
    const name = displayName.trim();
    if (!name) errors.displayName = "Enter the name you'd like us to call you.";
    else if (name.length > MAX_DISPLAY_NAME) {
      errors.displayName = `Keep it to ${MAX_DISPLAY_NAME} characters or fewer.`;
    }
  }
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  else if (mode === "sign-up" && password.length < MIN_PASSWORD) {
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  }
  return errors;
}

type LoginClientProps = {
  /** Where to go after signing in; already validated by safeNext on the server. */
  next: string;
};

export function LoginClient({ next }: LoginClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(id: string) {
    setMode(id === "sign-up" ? "sign-up" : "sign-in");
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const errors = validate(mode, displayName, email, password);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const supabase = getSupabaseBrowser();
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          throw new Error(
            "Your account was created, but no session came back. Email confirmation seems to be turned on in Supabase.",
          );
        }
      }
      router.replace(next);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setFormError(friendlyAuthError(message));
      setSubmitting(false);
    }
  }

  const signUp = mode === "sign-up";
  const submitLabel = submitting
    ? signUp
      ? "Creating account…"
      : "Signing in…"
    : signUp
      ? "Create account"
      : "Sign in";

  return (
    <main className="pb-16 pt-8">
      <PageContainer className="flex justify-center">
        <Panel className="flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-text">
              {signUp ? "Create your WatchNow account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted">
              {signUp
                ? "Save your ratings and watchlist to your account."
                : "Sign in to pick up where you left off."}
            </p>
          </div>

          <Tabs
            tabs={TABS}
            activeId={mode}
            onChange={switchMode}
            label="Sign in or create an account"
            idPrefix="login"
          />

          <form
            id={`login-panel-${mode}`}
            role="tabpanel"
            aria-labelledby={`login-tab-${mode}`}
            aria-busy={submitting}
            noValidate
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            {signUp ? (
              <TextField
                id="display-name"
                label="Display name"
                autoComplete="nickname"
                maxLength={MAX_DISPLAY_NAME}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                error={fieldErrors.displayName}
              />
            ) : null}
            <TextField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
            />
            <TextField
              id="password"
              label="Password"
              type="password"
              autoComplete={signUp ? "new-password" : "current-password"}
              minLength={signUp ? MIN_PASSWORD : undefined}
              hint={signUp ? `At least ${MIN_PASSWORD} characters.` : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
            />

            {formError ? (
              <p
                role="alert"
                className="rounded-xl border border-danger px-4 py-2 text-sm text-danger"
              >
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 min-h-11 rounded-full bg-electric px-6 text-sm font-semibold text-text transition-colors hover:bg-soft-blue disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
            >
              {submitLabel}
            </button>
          </form>
        </Panel>
      </PageContainer>
    </main>
  );
}
