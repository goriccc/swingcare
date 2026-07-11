/**
 * 스윙 세션 로컬 저장(오프라인 우선) + Supabase 동기화 큐.
 * 영상 픽셀은 저장하지 않음 — LandmarkFrame[] / PhaseMarker[] 만.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type {
  LandmarkFrame,
  PhaseMarker,
  SwingSession,
} from '../lib/landmarkTypes';
import { upsertSwingSession } from '../../../services/supabase/swingSessions';

const STORAGE_KEY = '@swingcare/swing_sessions_v1';

export type SessionSyncStatus = 'pending' | 'synced' | 'error';

export interface StoredSwingSession extends SwingSession {
  syncStatus: SessionSyncStatus;
  lastSyncError: string | null;
}

type Listener = () => void;

let cache: StoredSwingSession[] | null = null;
let hydrated = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `swing_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readAll(): Promise<StoredSwingSession[]> {
  if (cache) {
    return cache;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = [];
      return cache;
    }
    const parsed: unknown = JSON.parse(raw);
    cache = Array.isArray(parsed) ? (parsed as StoredSwingSession[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function writeAll(sessions: StoredSwingSession[]): Promise<void> {
  cache = sessions;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  emit();
}

export async function hydrateSwingSessionStore(): Promise<void> {
  if (hydrated) {
    return;
  }
  await readAll();
  hydrated = true;
  emit();
}

export function subscribeSwingSessionStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStoredSwingSessionsSnapshot(): StoredSwingSession[] {
  return cache ?? [];
}

export function buildSwingSession(input: {
  frames: LandmarkFrame[];
  phases: PhaseMarker[];
  durationMs: number;
  fps?: number;
}): SwingSession {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const durationMs = Math.max(0, input.durationMs);
  const fps =
    input.fps ??
    (durationMs > 0 && input.frames.length > 1
      ? Number(
          ((input.frames.length - 1) / (durationMs / 1000)).toFixed(1),
        )
      : 0);

  return {
    id: createId(),
    userId: null,
    createdAt: new Date().toISOString(),
    frames: input.frames,
    phases: input.phases,
    durationMs,
    deviceInfo: { platform, fps },
  };
}

/** 로컬 즉시 저장 후 백그라운드 동기화 시도 */
export async function saveSwingSessionLocalFirst(
  session: SwingSession,
): Promise<StoredSwingSession> {
  const sessions = await readAll();
  const stored: StoredSwingSession = {
    ...session,
    syncStatus: 'pending',
    lastSyncError: null,
  };
  await writeAll([stored, ...sessions.filter((s) => s.id !== session.id)]);
  void syncPendingSwingSessions();
  return stored;
}

export async function syncPendingSwingSessions(): Promise<{
  synced: number;
  failed: number;
  skipped: number;
}> {
  const sessions = await readAll();
  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const next = [...sessions];

  for (let i = 0; i < next.length; i += 1) {
    const item = next[i];
    if (item.syncStatus === 'synced') {
      skipped += 1;
      continue;
    }

    const result = await upsertSwingSession(item);
    if (result.ok) {
      next[i] = {
        ...item,
        userId: result.userId,
        syncStatus: 'synced',
        lastSyncError: null,
      };
      synced += 1;
    } else if (result.reason === 'not_configured') {
      next[i] = {
        ...item,
        syncStatus: 'pending',
        lastSyncError: result.message,
      };
      skipped += 1;
    } else {
      next[i] = {
        ...item,
        syncStatus: 'error',
        lastSyncError: result.message,
      };
      failed += 1;
    }
  }

  await writeAll(next);
  return { synced, failed, skipped };
}

export async function getLatestStoredSwingSession(): Promise<StoredSwingSession | null> {
  const sessions = await readAll();
  return sessions[0] ?? null;
}
