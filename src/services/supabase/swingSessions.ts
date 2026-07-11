/**
 * Supabase swing_sessions 테이블 read/write.
 * 기존 연운·파나나 스키마가 프로젝트에 없어 5.4절 기준으로 신규 설계함.
 * (다른 컨벤션이 있으면 맞춰 수정할 것)
 */

import type {
  LandmarkFrame,
  PhaseMarker,
  SwingSession,
} from '../../features/swing-capture/lib/landmarkTypes';

import { getSupabaseClient, isSupabaseConfigured } from './client';

/** DB row ↔ SwingSession 매핑 */
export interface SwingSessionRow {
  id: string;
  created_at: string;
  duration_ms: number;
  platform: 'ios' | 'android';
  fps: number;
  frames: LandmarkFrame[];
  phases: PhaseMarker[];
}

export function toSwingSessionRow(session: SwingSession): SwingSessionRow {
  return {
    id: session.id,
    created_at: session.createdAt,
    duration_ms: session.durationMs,
    platform: session.deviceInfo.platform,
    fps: session.deviceInfo.fps,
    frames: session.frames,
    phases: session.phases,
  };
}

export function fromSwingSessionRow(row: SwingSessionRow): SwingSession {
  return {
    id: row.id,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    frames: row.frames,
    phases: row.phases,
    deviceInfo: {
      platform: row.platform,
      fps: row.fps,
    },
  };
}

export type UpsertSwingSessionResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'error'; message: string };

/** 세션 upsert (좌표 JSON만, 영상 없음) */
export async function upsertSwingSession(
  session: SwingSession,
): Promise<UpsertSwingSessionResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'EXPO_PUBLIC_SUPABASE_URL / ANON_KEY 미설정',
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Supabase client unavailable',
    };
  }

  const { error } = await supabase
    .from('swing_sessions')
    .upsert(toSwingSessionRow(session), { onConflict: 'id' });

  if (error) {
    return { ok: false, reason: 'error', message: error.message };
  }
  return { ok: true };
}

export async function listRemoteSwingSessions(
  limit = 20,
): Promise<SwingSession[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('swing_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as SwingSessionRow[]).map(fromSwingSessionRow);
}
