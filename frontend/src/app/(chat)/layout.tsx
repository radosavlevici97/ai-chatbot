"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Sidebar } from "@/components/sidebar/sidebar";
import { MobileHeader } from "@/components/sidebar/mobile-header";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 animate-fade-in">
        <div className="relative flex h-12 w-12 items-center justify-center">
          {/* Outer spinning ring */}
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          {/* Inner bot icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-primary animate-pulse-subtle"
          >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground animate-pulse-subtle">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-dvh">
      <Sidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MobileHeader />
        {children}
      </main>
    </div>
  );
}
