import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AuthState = {
  authorId: string | null;
  /** Email session label from /api/v1/auth/me (wallet sessions clear this). */
  sessionEmail: string | null;
  /** False until first wallet/email identity resolution pass finishes. */
  sessionResolved: boolean;
  setAuthorId: (id: string | null) => void;
  setSessionEmail: (email: string | null) => void;
  setSessionResolved: (v: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      authorId: null,
      sessionEmail: null,
      sessionResolved: false,
      setAuthorId: (authorId) => set({ authorId }),
      setSessionEmail: (sessionEmail) => set({ sessionEmail }),
      setSessionResolved: (sessionResolved) => set({ sessionResolved }),
    }),
    {
      name: "chenchen-lib-author",
      partialize: (s) => ({
        authorId: s.authorId,
        sessionEmail: s.sessionEmail,
      }),
    },
  ),
);
