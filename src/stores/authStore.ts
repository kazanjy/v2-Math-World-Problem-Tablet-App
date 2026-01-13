import { create } from 'zustand';
import { supabase, getOrCreateProfile, signInWithMagicLink, signOut } from '../lib/supabase';
import type { UserProfile } from '../types';
import type { User } from '@supabase/supabase-js';

// Check if we're in dev mode (Supabase not configured)
const isDevMode = !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
  isDevMode: boolean;

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
  isDevMode,

  initialize: async () => {
    if (isDevMode) {
      console.warn('Running in dev mode - Supabase not configured');
      set({
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

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

    // Dev mode: create mock user
    if (isDevMode) {
      const mockUser = {
        id: `dev-${Date.now()}`,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
      } as User;

      const mockProfile: UserProfile = {
        id: mockUser.id,
        email,
        displayName: email.split('@')[0],
        createdAt: new Date(),
      };

      set({
        user: mockUser,
        profile: mockProfile,
        isLoading: false,
      });

      return { error: null };
    }

    const { error } = await signInWithMagicLink(email);
    set({ isLoading: false });
    return { error: error ? new Error(error.message) : null };
  },

  logout: async () => {
    set({ isLoading: true });

    if (!isDevMode) {
      await signOut();
    }

    set({
      user: null,
      profile: null,
      isLoading: false,
    });
  },
}));
