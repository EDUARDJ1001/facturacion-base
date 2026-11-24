import { apiRequest, publicJsonRequest } from "@/lib/api-client";
import type { AuthResponse, MeResponse, SessionTokens } from "@/types/api";

export const authService = {
  login: (payload: { username: string; password: string }) =>
    publicJsonRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  refresh: (refreshToken: string) =>
    publicJsonRequest<SessionTokens & { user: unknown }>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    }),
  me: (companyId?: number | null) => apiRequest<MeResponse>("/api/auth/me", { companyId })
};
