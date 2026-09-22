"use client";

import { create } from "zustand";
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type AuthUser,
} from "@/lib/api-client/auth";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  loadMe: () => Promise<AuthUser | null>;
  login: (input: { email: string; password: string }) => Promise<AuthUser>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",
  error: null,
  loadMe: async () => {
    set({ status: "loading", error: null });
    try {
      const user = await getMe();
      set({
        user,
        status: user ? "authenticated" : "anonymous",
        error: null,
      });
      return user;
    } catch (error) {
      set({
        user: null,
        status: "anonymous",
        error: getErrorMessage(error, "Could not load session."),
      });
      return null;
    }
  },
  login: async (input) => {
    set({ status: "loading", error: null });
    try {
      const user = await loginRequest(input);
      set({ user, status: "authenticated", error: null });
      return user;
    } catch (error) {
      set({
        user: null,
        status: "anonymous",
        error: getErrorMessage(error, "Could not log in."),
      });
      throw error;
    }
  },
  register: async (input) => {
    set({ status: "loading", error: null });
    try {
      const user = await registerRequest(input);
      set({ user, status: "authenticated", error: null });
      return user;
    } catch (error) {
      set({
        user: null,
        status: "anonymous",
        error: getErrorMessage(error, "Could not register."),
      });
      throw error;
    }
  },
  logout: async () => {
    try {
      await logoutRequest();
    } finally {
      set({ user: null, status: "anonymous", error: null });
    }
  },
}));
