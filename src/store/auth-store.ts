import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AuthState = {
  authorId: string | null;
  setAuthorId: (id: string | null) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      authorId: null,
      setAuthorId: (authorId) => set({ authorId }),
    }),
    { name: "chenchen-lib-author" },
  ),
);
