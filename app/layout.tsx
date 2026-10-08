import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { AuthProvider } from "@/lib/auth";
import { UserStateProvider } from "@/lib/user-state";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WatchNow",
  description: "Discover, rate, and decide what to watch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <UserStateProvider>
            <Header />
            <div className="pb-16 tablet:pb-0">
              {children}
              <Footer />
            </div>
            <BottomNav />
          </UserStateProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
