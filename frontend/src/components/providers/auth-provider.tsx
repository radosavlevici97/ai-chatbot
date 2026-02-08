"use client";

import { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { setSessionCookie, clearSessionCookie } from "@/lib/session-cookie";
import type { UserProfile, LoginInput, RegisterInput } from "@chatbot/shared";

type AuthContext = {
  user: UserProfile | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ user: UserProfile }>("/auth/me").then((d) => d.user),
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: UserProfile }>("/auth/login", input),
    onSuccess: (data) => {
      setSessionCookie();
      queryClient.setQueryData(["auth", "me"], data.user);
      router.push("/");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => api.post<{ user: UserProfile }>("/auth/register", input),
    onSuccess: (data) => {
      setSessionCookie();
      queryClient.setQueryData(["auth", "me"], data.user);
      router.push("/");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      clearSessionCookie();
      queryClient.clear();
      router.push("/login");
    },
  });

  return (
    <AuthCtx.Provider
      value={{
        user: user ?? null,
        isLoading,
        login: async (input) => { await loginMutation.mutateAsync(input); },
        register: async (input) => { await registerMutation.mutateAsync(input); },
        logout: async () => { await logoutMutation.mutateAsync(); },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
