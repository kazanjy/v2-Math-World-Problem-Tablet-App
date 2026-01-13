import { create } from 'zustand';
import { supabase, getOrCreateProfile, signInWithMagicLink, signOut } from '../lib/supabase';
import { getLocalProfile, saveLocalProfile, clearLocalProfile, clearAllLocalData } from '../lib/localStorage';
import type { UserProfile } from '../types';
import type { User } from '@supabase/supabase-js';

// Check if we're in demo mode (Supabase not configured)
const isDemoMode = !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
  isDemoMode: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string) => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
  clearDemoData: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  isDemoMode,

  initialize: async () => {
    if (isDemoMode) {
      console.warn('Running in demo mode - Supabase not configured, using localStorage');

      // Check for existing profile in localStorage
      const existingProfile = getLocalProfile();
      if (existingProfile) {
        const mockUser = {
          id: existingProfile.id,
          email: existingProfile.email,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: existingProfile.createdAt.toISOString(),
        } as User;

        set({
          user: mockUser,
          profile: existingProfile,
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
      return;
    }

    // Get initial session from Supabase
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

    // Demo mode: create mock user and save to localStorage
    if (isDemoMode) {
      const mockUser = {
        id: `demo-${Date.now()}`,
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

      // Save to localStorage for persistence
      saveLocalProfile(mockProfile);

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

    if (isDemoMode) {
      clearLocalProfile();
    } else {
      await signOut();
    }

    set({
      user: null,
      profile: null,
      isLoading: false,
    });
  },

  clearDemoData: () => {
    if (isDemoMode) {
      clearAllLocalData();
      set({
        user: null,
        profile: null,
      });
    }
  },
}));

// Re-export for backwards compatibility
export const isDevMode = isDemoMode;
