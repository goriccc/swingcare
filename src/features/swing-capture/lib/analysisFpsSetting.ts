import { fileKvStore } from '../../../services/storage/fileKvStore';

export const ANALYSIS_FPS_STORAGE_KEY = 'analysis_fps';
export const DEFAULT_ANALYSIS_FPS = 12;
export const MIN_ANALYSIS_FPS = 10;
export const MAX_ANALYSIS_FPS = 15;

export function normalizeAnalysisFps(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ANALYSIS_FPS;
  }
  return Math.min(
    MAX_ANALYSIS_FPS,
    Math.max(MIN_ANALYSIS_FPS, Math.round(value)),
  );
}

export async function getAnalysisFps(): Promise<number> {
  const stored = await fileKvStore.getItem(ANALYSIS_FPS_STORAGE_KEY);
  if (stored == null || stored.trim() === '') {
    return DEFAULT_ANALYSIS_FPS;
  }
  return normalizeAnalysisFps(Number(stored));
}

export async function setAnalysisFps(value: number): Promise<number> {
  const normalized = normalizeAnalysisFps(value);
  await fileKvStore.setItem(ANALYSIS_FPS_STORAGE_KEY, String(normalized));
  return normalized;
}
