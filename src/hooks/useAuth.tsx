import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: AppRole | null;
  isAdmin: boolean;
  username: string | null;
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (username: string, email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  quickSignIn: () => Promise<{ error: Error | null }>;
  verifyPassword: (password: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (!error && data) {
      setUserRole(data.some(({ role }) => role === 'admin') ? 'admin' : data.some(({ role }) => role === 'viewer') ? 'viewer' : null);
    } else {
      setUserRole(null);
    }
  };

  const fetchUsername = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (data?.username) {
      setUsername(data.username);
    }
  };


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
            fetchUsername(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
          setUsername(null);
        }
        
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
        fetchUsername(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithUsername = async (usernameInput: string, password: string) => {
    // Get email from username using database function
    const { data: email, error: lookupError } = await supabase
      .rpc('get_email_by_username', { _username: usernameInput });
    
    if (lookupError || !email) {
      return { error: new Error('שם משתמש לא נמצא') };
    }

    await supabase.rpc('end_approval_session');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (usernameInput: string, email: string, password: string) => {
    // Check if username is already taken
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', usernameInput)
      .maybeSingle();
    
    if (existingUser) {
      return { error: new Error('שם משתמש כבר קיים') };
    }

    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          username: usernameInput,
          display_name: usernameInput
        }
      }
    });
    return { error: error as Error | null };
  };

  const QUICK_EMAIL = 'quick@app.local';
  const QUICK_PASSWORD = 'quick-access-2026';

  const quickSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: QUICK_EMAIL,
      password: QUICK_PASSWORD,
    });

    if (!error) return { error: null };

    const { error: signUpError } = await supabase.auth.signUp({
      email: QUICK_EMAIL,
      password: QUICK_PASSWORD,
      options: {
        emailRedirectTo: window.location.origin,
        data: { username: 'כניסה מהירה', display_name: 'כניסה מהירה' },
      },
    });

    if (signUpError) return { error: signUpError as Error };

    const { error: retryError } = await supabase.auth.signInWithPassword({
      email: QUICK_EMAIL,
      password: QUICK_PASSWORD,
    });
    return { error: retryError as Error | null };
  };

  const signOut = async () => {
    await supabase.rpc('end_approval_session');
    await supabase.auth.signOut();
    setUserRole(null);
    setUsername(null);
  };

  const verifyPassword = async (password: string): Promise<boolean> => {
    if (!user?.email) return false;
    
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password
    });
    
    return !error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        userRole,
        isAdmin: userRole === 'admin',
        username,
        signInWithUsername,
        signUp,
        signOut,
        quickSignIn,
        verifyPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
