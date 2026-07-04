import { api } from "@/lib/api";

export interface AuthResult {
    accessToken: string;
    user: { id: number; name: string | null; email: string };
}

export const login = (email: string, password: string) =>
    api.post<AuthResult>("/api/login", { email, password });

export const register = (body: { email: string; password: string; name?: string }) =>
    api.post<AuthResult>("/api/register", body);

export const heartbeat = () => api.get("/heartbeat");
