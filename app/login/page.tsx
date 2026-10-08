import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Sign in · WatchNow",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  // Already signed in: skip the form.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  return <LoginClient next={next} />;
}
