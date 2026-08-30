import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { getSession } from './auth';

// Every piece of local app state lives under this prefix (see services/storage.ts,
// services/calendar.ts). Syncing "all keys under the prefix" means new features
// that add new @vitalis/ keys are automatically covered with no changes here.
const SYNC_PREFIX = '@vitalis/';
// The wger exercise-library cache is a large, disposable API cache, not user
// data — excluding it keeps the synced blob small and avoids re-syncing
// something that just re-downloads on its own anyway.
const EXCLUDED_PREFIX = '@vitalis/wger_';
// Sync bookkeeping lives outside SYNC_PREFIX on purpose, so it's never itself
// swept into the snapshot it's tracking.
const LAST_SYNC_KEY = '@vitalis-sync/lastSyncedAt';

export type SyncResult =
  | { status: 'skipped'; reason: 'not_configured' | 'signed_out' }
  | { status: 'pushed' | 'pulled' }
  | { status: 'error'; message: string };

async function collectSnapshot(): Promise<Record<string, string>> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter((k) => k.startsWith(SYNC_PREFIX) && !k.startsWith(EXCLUDED_PREFIX));
  const pairs = await AsyncStorage.multiGet(keys);
  const snapshot: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

async function applySnapshot(snapshot: Record<string, string>): Promise<void> {
  const entries = Object.entries(snapshot);
  if (entries.length === 0) return;
  await AsyncStorage.multiSet(entries);
}

async function fetchRemote(userId: string): Promise<{ data: Record<string, string>; updatedAt: string } | null> {
  const { data, error } = await supabase!
    .from('user_data')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { data: data.data as Record<string, string>, updatedAt: data.updated_at as string };
}

async function pushLocal(userId: string): Promise<void> {
  const snapshot = await collectSnapshot();
  const { error } = await supabase!
    .from('user_data')
    .upsert({ user_id: userId, data: snapshot }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

async function pullRemote(userId: string, remote: { data: Record<string, string>; updatedAt: string }): Promise<void> {
  await applySnapshot(remote.data);
  await AsyncStorage.setItem(LAST_SYNC_KEY, remote.updatedAt);
}

/**
 * Whole-blob last-write-wins: whichever side (local vs. remote) changed more
 * recently overwrites the other entirely. There's no per-field merge — for a
 * personal app used across a small number of devices this is a reasonable
 * v1 tradeoff, but two devices editing offline at the same time will have
 * the older device's edits silently lost. The one deliberately lossy case is
 * a brand-new device's very first sync: since it has no local-data history
 * to compare against, remote always wins so signing in reliably restores
 * your synced data rather than guessing.
 */
export async function syncNow(): Promise<SyncResult> {
  if (!isSupabaseConfigured) return { status: 'skipped', reason: 'not_configured' };
  const session = await getSession();
  if (!session) return { status: 'skipped', reason: 'signed_out' };

  try {
    const userId = session.user.id;
    const remote = await fetchRemote(userId);
    const lastSyncedAt = await AsyncStorage.getItem(LAST_SYNC_KEY);

    if (!remote) {
      await pushLocal(userId);
      return { status: 'pushed' };
    }
    if (!lastSyncedAt || new Date(remote.updatedAt) > new Date(lastSyncedAt)) {
      await pullRemote(userId, remote);
      return { status: 'pulled' };
    }
    await pushLocal(userId);
    return { status: 'pushed' };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function getLastSyncedAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

export async function clearSyncState(): Promise<void> {
  await AsyncStorage.removeItem(LAST_SYNC_KEY);
}
