import { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

export { isSupabaseConfigured };

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured — add EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY to .env');
  return supabase;
}

export async function signUp(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await requireClient().auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await requireClient().auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
