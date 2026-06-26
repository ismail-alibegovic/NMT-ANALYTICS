import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getMeContext, UserContext } from '../api/me';
import { useToast } from './ToastContext';
import { logger } from '../utils/logger';

interface AppContextType {
  user: User | null;
  userContext: UserContext | null;
  loading: boolean;
  profileLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Single-flight guard: prevent duplicate in-flight requests
  const isFetchingContext = useRef(false);
  const inFlightPromise = useRef<Promise<void> | null>(null);

  // Caching: store successful context and track user changes
  const cachedContext = useRef<UserContext | null>(null);
  const lastUserId = useRef<string | null>(null);

  // 429 Cooldown: prevent retries for 60 seconds after rate limit
  const rateLimitCooldownUntil = useRef<number>(0);

  const toast = useToast();

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem('nmt_auth_token', newToken);
    } else {
      localStorage.removeItem('nmt_auth_token');
    }
  };

  const fetchUserContext = async (user: User | null, force = false) => {
    if (!user) {
      setUserContext(null);
      cachedContext.current = null;
      lastUserId.current = null;
      isFetchingContext.current = false;
      inFlightPromise.current = null;
      logger.log('[AppContext] No user, clearing context');
      return;
    }

    // Check 429 cooldown: if we're in cooldown period, use cached context
    const now = Date.now();
    if (rateLimitCooldownUntil.current > now) {
      const remainingSeconds = Math.ceil((rateLimitCooldownUntil.current - now) / 1000);
      logger.warn(`[AppContext] In 429 cooldown for ${remainingSeconds}s, using cached context`);
      if (cachedContext.current) {
        setUserContext(cachedContext.current);
      }
      return;
    }

    // Return cached context if user hasn't changed and we're not forcing
    if (!force && cachedContext.current && lastUserId.current === user.id) {
      logger.log('[AppContext] Using cached context for:', user.id);
      setUserContext(cachedContext.current);
      return;
    }

    // Single-flight guard: if request is already in-flight, wait for it
    if (inFlightPromise.current) {
      logger.log('[AppContext] Request already in-flight, waiting for it to complete...');
      try {
        await inFlightPromise.current;
        logger.log('[AppContext] In-flight request completed, using result');
      } catch (error) {
        logger.error('[AppContext] In-flight request failed:', error);
      }
      return;
    }

    // Prevent parallel fetching (belt and suspenders with inFlightPromise)
    if (isFetchingContext.current) {
      logger.log('[AppContext] Already fetching context (flag check), skipping...');
      return;
    }

    // Start new request
    isFetchingContext.current = true;
    setProfileLoading(true);
    logger.log('[AppContext] Fetching user context for:', user.id);

    // Create the promise and store it for single-flight guard
    const fetchPromise = (async () => {
      try {
        const context = await getMeContext();
        setUserContext(context);
        cachedContext.current = context; // Cache successful response
        lastUserId.current = user.id; // Track user ID
        rateLimitCooldownUntil.current = 0; // Clear any cooldown on success
        logger.log('[AppContext] User context loaded:', {
          org: context.org?.name,
          role: context.role,
          modules: context.modules?.length
        });
      } catch (error: any) {
        logger.error('[AppContext] Failed to fetch user context:', error);

        // 429: Rate limit - DO NOT RETRY, enforce 60-second cooldown
        if (error.response?.status === 429 || error.status === 429) {
          const cooldownSeconds = 60;
          rateLimitCooldownUntil.current = Date.now() + (cooldownSeconds * 1000);
          logger.error(`[AppContext] 429 - Rate limited. Cooldown for ${cooldownSeconds}s`);
          toast.error(`Too many requests. Please wait ${cooldownSeconds} seconds before refreshing.`);

          if (cachedContext.current) {
            logger.log('[AppContext] Using cached context due to rate limit');
            setUserContext(cachedContext.current);
          }
          // Do NOT set minimal context - this prevents further requests
          return;
        }

        // 401: Invalid/expired token - sign out
        if (error.response?.status === 401) {
          logger.warn('[AppContext] 401 - Signing out');
          await supabase.auth.signOut();
          setUserContext(null);
          cachedContext.current = null;
          lastUserId.current = null;
          rateLimitCooldownUntil.current = 0;
        }
        // 403: Profile not found - in dev, this should auto-bootstrap on API side
        else if (error.response?.status === 403) {
          logger.error('[AppContext] 403 - Profile not found. Check API DEV_AUTO_BOOTSTRAP.');
          toast.error('Profile setup required. Please contact support.');
          await supabase.auth.signOut();
          setUserContext(null);
          cachedContext.current = null;
          lastUserId.current = null;
          rateLimitCooldownUntil.current = 0;
        }
        // 500: Server error - set minimal context to prevent infinite loading
        else if (error.response?.status === 500) {
          logger.error('[AppContext] 500 - Server error. Setting minimal context.');
          toast.error('Server error loading profile. Please try again later.');
          const minimalContext = {
            user: { id: user.id, email: user.email || '' },
            org: { id: 'error', name: 'Error Loading', slug: 'error' },
            role: 'viewer',
            modules: [],
          };
          setUserContext(minimalContext);
          cachedContext.current = minimalContext; // Cache to prevent retries
        }
        // Other errors: set minimal context to prevent infinite loading
        else {
          logger.warn('[AppContext] Setting minimal context due to error');
          const minimalContext = {
            user: { id: user.id, email: user.email || '' },
            org: { id: 'error', name: 'Error Loading', slug: 'error' },
            role: 'viewer',
            modules: [],
          };
          setUserContext(minimalContext);
          cachedContext.current = minimalContext; // Cache to prevent retries
        }
      } finally {
        setProfileLoading(false);
        isFetchingContext.current = false;
        inFlightPromise.current = null; // Clear the in-flight promise
      }
    })();

    // Store the promise for single-flight guard
    inFlightPromise.current = fetchPromise;

    // Wait for completion
    await fetchPromise;
  };

  // Consolidated trigger for fetching context
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      // Check for dev mock session first (development only)
      if (import.meta.env.DEV) {
        const storedUser = localStorage.getItem('nmt_user');
        const storedToken = localStorage.getItem('nmt_auth_token');
        
        if (storedUser && storedToken === 'dev-token') {
          try {
            const mockUser = JSON.parse(storedUser);
            logger.log('[AppContext] Using dev mock session for:', mockUser.email);
            
            // Set a mock user object
            const mockUserObj = {
              id: mockUser.id,
              email: mockUser.email,
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as any;
            
            setUser(mockUserObj);
            setToken('dev-token');
            
            // Fetch context with the mock user
            await fetchUserContext(mockUserObj);
            if (mounted) setLoading(false);
            return;
          } catch (e) {
            logger.error('[AppContext] Failed to parse dev mock user:', e);
            localStorage.removeItem('nmt_user');
            localStorage.removeItem('nmt_auth_token');
          }
        }
      }

      // 1. Get initial session
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      const initialUser = session?.user ?? null;
      setUser(initialUser);
      if (session) {
        setToken(session.access_token);
      }

      // 2. Fetch context for initial user
      await fetchUserContext(initialUser);
      if (mounted) setLoading(false);

      // 3. Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) return;

          const currentUser = session?.user ?? null;
          setUser(currentUser);

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            setToken(session?.access_token || null);
          } else if (event === 'SIGNED_OUT') {
            setToken(null);
          }

          // Only fetch context on SIGNED_IN, not on TOKEN_REFRESHED
          // TOKEN_REFRESHED should use cached context
          if (event === 'SIGNED_IN' && currentUser) {
            await fetchUserContext(currentUser, true); // Force refresh on sign in
          } else if (event === 'SIGNED_OUT') {
            setUserContext(null);
            cachedContext.current = null;
            lastUserId.current = null;
          }

          if (mounted) setLoading(false);
        }
      );

      return subscription;
    };

    const authPromise = initAuth();

    return () => {
      mounted = false;
      authPromise.then(sub => sub?.unsubscribe());
    };
  }, []);

  useEffect(() => {
    const handleApiAuthError = async (event: Event) => {
      const customEvent = event as CustomEvent;
      toast.error(customEvent.detail.message);
      // Sign out to trigger redirect to login
      await supabase.auth.signOut();
    };

    window.addEventListener('api-auth-error', handleApiAuthError);

    return () => {
      window.removeEventListener('api-auth-error', handleApiAuthError as EventListener);
    };
  }, []); // toast is stable, no need to re-register listener

  const value: AppContextType = {
    user,
    userContext,
    loading,
    profileLoading,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
