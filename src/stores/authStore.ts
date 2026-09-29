import { create } from 'zustand';
import { supabase, getOrCreateProfile, signInWithMagicLink, signOut } from '../lib/supabase';
import { getLocalProfile, saveLocalProfile, clearLocalProfile, clearAllLocalData, getLocalSessions } from '../lib/localStorage';
import { migrateLocalDataToSupabase } from '../lib/migrateLocal';
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
  isUsingDemoLogin: boolean; // true while running on a local (not backend) identity

  // Actions
  initialize: () => Promise<void>;
  startLocalSession: (email: string) => void;
  login: (email: string) => Promise<{ error: Error | null }>;
  loginAsDemo: () => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
  clearDemoData: () => void;
}

type SetState = (partial: Partial<AuthState>) => void;

// A local identity is represented as a mock Supabase user so the rest of the
// app can treat local and backend identities uniformly.
function localUserFor(profile: UserProfile): User {
  return {
    id: profile.id,
    email: profile.email,
    aud: 'authenticated',
    role: 'authenticated',
    created_at: profile.createdAt.toISOString(),
  } as User;
}

function makeLocalProfile(email: string, displayName?: string): UserProfile {
  return {
    id: `local-${Date.now()}`,
    email,
    displayName: displayName ?? (email.split('@')[0] || 'Student'),
    createdAt: new Date(),
  };
}

// Adopt a real backend session: load/create the profile, fuse any local
// session data into the account, retire the local identity, and switch the
// app to backend storage. Guarded so getSession() and SIGNED_IN can't run it
// concurrently.
let adopting: Promise<void> | null = null;
function adoptSupabaseUser(user: User, set: SetState): Promise<void> {
  if (adopting) return adopting;
  adopting = (async () => {
    try {
      const profile = await getOrCreateProfile(user.id, user.email || '');
      if (getLocalSessions().length > 0) {
        const { migrated, failed } = await migrateLocalDataToSupabase(user.id);
        console.info(
          `Merged ${migrated} local session(s) into your account${failed ? ` (${failed} could not be merged and were kept on this device)` : ''}.`
        );
      }
      clearLocalProfile();
      set({ user, profile, isLoading: false, isInitialized: true, isUsingDemoLogin: false });
    } finally {
      adopting = null;
    }
  })();
  return adopting;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  isDemoMode,
  isUsingDemoLogin: false,

  initialize: async () => {
    const localProfile = getLocalProfile();
    const applyLocalIdentity = () => {
      if (localProfile) {
        set({ user: localUserFor(localProfile), profile: localProfile, isLoading: false, isInitialized: true, isUsingDemoLogin: true });
      } else {
        set({ user: null, profile: null, isLoading: false, isInitialized: true });
      }
    };

    if (isDemoMode) {
      // No backend configured: the local identity is the only identity.
      applyLocalIdentity();
      return;
    }

    try {
      // A real backend session always wins over a lingering local identity —
      // this is what lets tapping a magic link fuse local play into the account.
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session?.user) {
        await adoptSupabaseUser(session.user, set);
      } else {
        applyLocalIdentity();
      }

      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          void adoptSupabaseUser(session.user, set);
        } else if (event === 'SIGNED_OUT') {
          set({ user: null, profile: null, isLoading: false, isUsingDemoLogin: false });
        }
      });
    } catch (error) {
      console.error('Error initializing auth:', error);
      applyLocalIdentity();
    }
  },

  // Start playing immediately under a local identity for this email. When a
  // backend is configured, a sign-in link is sent in the background; tapping
  // it (now or later, on any device) merges this local play into the account.
  startLocalSession: (email: string) => {
    const profile = makeLocalProfile(email);
    saveLocalProfile(profile);
    set({ user: localUserFor(profile), profile, isLoading: false, isInitialized: true, isUsingDemoLogin: true });

    if (!isDemoMode) {
      signInWithMagicLink(email)
        .then(({ error }) => {
          if (error) console.warn('Could not send sign-in link:', error.message);
        })
        .catch((err) => console.warn('Could not send sign-in link:', err));
    }
  },

  // (Re)send the sign-in link for an email.
  login: async (email: string) => {
    if (isDemoMode) return { error: null };
    try {
      const { error } = await signInWithMagicLink(email);
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  },

  loginAsDemo: async () => {
    const profile = makeLocalProfile('demo@example.com', 'Demo User');
    saveLocalProfile(profile);
    set({ user: localUserFor(profile), profile, isLoading: false, isInitialized: true, isUsingDemoLogin: true });
    return { error: null };
  },

  logout: async () => {
    set({ isLoading: true });

    // Always clear the local identity (covers both demo mode and local play)
    clearLocalProfile();

    if (!isDemoMode) {
      try {
        await signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      }
    }

    set({ user: null, profile: null, isLoading: false, isUsingDemoLogin: false });
  },

  clearDemoData: () => {
    clearAllLocalData();
    set({ user: null, profile: null, isUsingDemoLogin: false });
  },
}));

// Re-export for backwards compatibility
export const isDevMode = isDemoMode;
