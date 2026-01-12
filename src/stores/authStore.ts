import { create } from 'zustand';
import { supabase, getOrCreateProfile, signInWithMagicLink, signOut } from '../lib/supabase';
import type { UserProfile } from '../types';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string) => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const profile = await getOrCreateProfile(session.user.id, session.user.email || '');
      set({
        user: session.user,
        profile,
        isLoading: false,
        isInitialized: true,
      });
    } else {
      set({
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
      });
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await getOrCreateProfile(session.user.id, session.user.email || '');
        set({
          user: session.user,
          profile,
          isLoading: false,
        });
      } else if (event === 'SIGNED_OUT') {
        set({
          user: null,
          profile: null,
          isLoading: false,
        });
      }
    });
  },

  login: async (email: string) => {
    set({ isLoading: true });
    const { error } = await signInWithMagicLink(email);
    set({ isLoading: false });
    return { error: error ? new Error(error.message) : null };
  },

  logout: async () => {
    set({ isLoading: true });
    await signOut();
    set({
      user: null,
      profile: null,
      isLoading: false,
    });
  },
}));
