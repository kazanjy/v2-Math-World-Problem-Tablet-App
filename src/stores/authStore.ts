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
  isUsingDemoLogin: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string) => Promise<{ error: Error | null }>;
  loginAsDemo: () => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
  clearDemoData: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  isDemoMode,
  isUsingDemoLogin: false,

  initialize: async () => {
    // Check for existing demo profile in localStorage first
    const existingLocalProfile = getLocalProfile();
    if (existingLocalProfile) {
      const mockUser = {
        id: existingLocalProfile.id,
        email: existingLocalProfile.email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: existingLocalProfile.createdAt.toISOString(),
      } as User;

      set({
        user: mockUser,
        profile: existingLocalProfile,
        isLoading: false,
        isInitialized: true,
        isUsingDemoLogin: true,
      });
      return;
    }

    if (isDemoMode) {
      console.warn('Running in demo mode - Supabase not configured');
      set({
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

    // Try to get session from Supabase
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Error getting session:', error);
        set({
          user: null,
          profile: null,
          isLoading: false,
          isInitialized: true,
        });
        return;
      }

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
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
      });
    }
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
        isInitialized: true,
        isUsingDemoLogin: true,
      });

      return { error: null };
    }

    try {
      const { error } = await signInWithMagicLink(email);
      set({ isLoading: false });
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      set({ isLoading: false });
      return { error: error as Error };
    }
  },

  loginAsDemo: async () => {
    set({ isLoading: true });

    const mockUser = {
      id: `demo-${Date.now()}`,
      email: 'demo@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
    } as User;

    const mockProfile: UserProfile = {
      id: mockUser.id,
      email: 'demo@example.com',
      displayName: 'Demo User',
      createdAt: new Date(),
    };

    // Save to localStorage for persistence
    saveLocalProfile(mockProfile);

    set({
      user: mockUser,
      profile: mockProfile,
      isLoading: false,
      isInitialized: true,
      isUsingDemoLogin: true,
    });

    return { error: null };
  },

  logout: async () => {
    set({ isLoading: true });

    // Always clear local profile (handles both demo mode and demo login)
    clearLocalProfile();

    if (!isDemoMode) {
      try {
        await signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      }
    }

    set({
      user: null,
      profile: null,
      isLoading: false,
      isUsingDemoLogin: false,
    });
  },

  clearDemoData: () => {
    clearAllLocalData();
    set({
      user: null,
      profile: null,
      isUsingDemoLogin: false,
    });
  },
}));

// Re-export for backwards compatibility
export const isDevMode = isDemoMode;
