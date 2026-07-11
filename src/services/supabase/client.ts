/** Supabase 클라이언트 — 익명 세션 persist (expo-file-system KV) */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { fileKvStore } from '../storage/fileKvStore';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

/** 진단용 — 키 값은 노출하지 않음 */
export function getSupabaseConfigStatus(): {
  configured: boolean;
  hasUrl: boolean;
  hasAnonKey: boolean;
} {
  return {
    configured: isSupabaseConfigured(),
    hasUrl: supabaseUrl.length > 0,
    hasAnonKey: supabaseAnonKey.length > 0,
  };
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    if (__DEV__) {
      console.warn('[supabase] not configured', getSupabaseConfigStatus());
    }
    return null;
  }
  if (!client) {
    if (__DEV__) {
      console.log('[supabase] config', {
        hasUrl: supabaseUrl.length > 0,
        hasAnonKey: supabaseAnonKey.length > 0,
      });
    }
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: fileKvStore,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** 익명 로그인 보장 후 user id 반환 (미설정/실패 시 null) */
export async function ensureAnonymousUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) {
    return session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user?.id) {
    console.warn('[supabase] anonymous sign-in failed', error?.message);
    return null;
  }
  return data.user.id;
}
