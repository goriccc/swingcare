/**
 * 규칙 기반 8단계 스윙 구간 분할 순수 함수 (GolfDB 체계).
 *
 * ⚠️ PLACEHOLDER: 손목 y·속도로 근사하는 MVP. 학습 분류기(SwingNet 등)로 교체 예정.
 * 입력/출력 인터페이스(LandmarkFrame[] → PhaseMarker[])만 유지하면 내부 교체 가능.
 */

import type {
  LandmarkFrame,
  PhaseMarker,
  SwingPhase,
} from './landmarkTypes';
import { LANDMARK_INDEX } from './landmarkTypes';

/**
 * 트레일 손목 인덱스.
 * 실기기 검증: 오른손 들기 → right_wrist(16) 반응 확인됨 (우타 가정 MVP).
 * 좌타/카메라 반전 시 옵션으로 교체.
 */
export const DEFAULT_TRAIL_WRIST_INDEX = LANDMARK_INDEX.right_wrist;

/** finish: 절대 하한 (정규화 좌표/프레임). 지터보다 약간 위 */
export const FINISH_VELOCITY_FLOOR = 0.025;

/**
 * finish: impact 피크 속도 대비 비율.
 * 고정 임계값(0.012)은 실기기 지터에 막혀 거의 항상 폴백됐음.
 */
export const FINISH_VELOCITY_PEAK_RATIO = 0.22;

/** finish 안정 프레임 수 */
export const FINISH_STABLE_FRAME_COUNT = 3;

/** soft finish: impact 이후 이 비율만큼 지난 뒤부터 최저 속도 구간 탐색 */
export const FINISH_SOFT_SEARCH_START_RATIO = 0.25;

/** top 탐지 시 address 직후 스킵할 최소 프레임 (노이즈) */
export const TOP_SEARCH_MIN_OFFSET_FRAMES = 3;

/** impact 탐지 시 top 직후 스킵할 최소 프레임 */
export const IMPACT_SEARCH_MIN_OFFSET_FRAMES = 2;

export interface SegmentSwingPhasesOptions {
  /** 기본 right_wrist(16). 좌타 등이면 left_wrist 등으로 교체 */
  trailWristIndex?: number;
  /** @deprecated 절대 임계 대신 peak ratio 사용. 호환용 하한으로만 씀 */
  finishVelocityThreshold?: number;
  finishVelocityPeakRatio?: number;
  finishStableFrameCount?: number;
}

export interface SegmentSwingPhasesResult {
  phases: PhaseMarker[];
  /** 탐지에 사용한 트레일 손목 인덱스 */
  trailWristIndex: number;
  /** 실패/폴백 사유 (성공 시 null) */
  warning: string | null;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, index));
}

function nearestFrameIndex(
  frames: readonly LandmarkFrame[],
  timestampMs: number,
): number {
  if (frames.length === 0) {
    return 0;
  }
  let best = 0;
  let bestDist = Math.abs(frames[0].timestampMs - timestampMs);
  for (let i = 1; i < frames.length; i += 1) {
    const dist = Math.abs(frames[i].timestampMs - timestampMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function wristPoint(
  frame: LandmarkFrame,
  wristIndex: number,
): { x: number; y: number } | null {
  const point = frame.landmarks[wristIndex];
  if (!point) {
    return null;
  }
  return { x: point.x, y: point.y };
}

function frameVelocity(
  prev: LandmarkFrame,
  next: LandmarkFrame,
  wristIndex: number,
): number {
  const a = wristPoint(prev, wristIndex);
  const b = wristPoint(next, wristIndex);
  if (!a || !b) {
    return 0;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function marker(
  phase: SwingPhase,
  frames: readonly LandmarkFrame[],
  frameIndex: number,
  source: PhaseMarker['source'],
): PhaseMarker {
  const index = clampIndex(frameIndex, frames.length);
  return {
    phase,
    timestampMs: frames[index]?.timestampMs ?? 0,
    frameIndex: index,
    source,
  };
}

function interpolatedMarker(
  phase: SwingPhase,
  frames: readonly LandmarkFrame[],
  timestampMs: number,
): PhaseMarker {
  const frameIndex = nearestFrameIndex(frames, timestampMs);
  return {
    phase,
    timestampMs,
    frameIndex,
    source: 'interpolated',
  };
}

/**
 * LandmarkFrame[] → GolfDB 8단계 PhaseMarker[].
 * address/top/impact/finish = detected, 나머지 4개 = interpolated.
 */
export function segmentSwingPhases(
  frames: readonly LandmarkFrame[],
  options: SegmentSwingPhasesOptions = {},
): SegmentSwingPhasesResult {
  const trailWristIndex = options.trailWristIndex ?? DEFAULT_TRAIL_WRIST_INDEX;
  const finishVelocityFloor =
    options.finishVelocityThreshold ?? FINISH_VELOCITY_FLOOR;
  const finishVelocityPeakRatio =
    options.finishVelocityPeakRatio ?? FINISH_VELOCITY_PEAK_RATIO;
  const finishStableFrameCount =
    options.finishStableFrameCount ?? FINISH_STABLE_FRAME_COUNT;

  if (frames.length === 0) {
    return {
      phases: [],
      trailWristIndex,
      warning: 'empty frames',
    };
  }

  // 1) address = t=0
  const addressIndex = 0;

  // 2) top = address 이후 손목 y 최솟값 (화면 위쪽이 작은 y)
  let topIndex = addressIndex;
  let minY = Number.POSITIVE_INFINITY;
  const topSearchStart = Math.min(
    frames.length - 1,
    addressIndex + TOP_SEARCH_MIN_OFFSET_FRAMES,
  );
  for (let i = topSearchStart; i < frames.length; i += 1) {
    const point = wristPoint(frames[i], trailWristIndex);
    if (!point) {
      continue;
    }
    if (point.y < minY) {
      minY = point.y;
      topIndex = i;
    }
  }
  if (!Number.isFinite(minY)) {
    topIndex = Math.floor(frames.length * 0.35);
  }

  // 3) impact = top 이후 프레임 간 손목 속도 최댓값
  let impactIndex = Math.min(frames.length - 1, topIndex + 1);
  let maxVelocity = -1;
  const impactSearchStart = Math.min(
    frames.length - 1,
    topIndex + IMPACT_SEARCH_MIN_OFFSET_FRAMES,
  );
  for (let i = Math.max(1, impactSearchStart); i < frames.length; i += 1) {
    const velocity = frameVelocity(frames[i - 1], frames[i], trailWristIndex);
    if (velocity > maxVelocity) {
      maxVelocity = velocity;
      impactIndex = i;
    }
  }
  if (maxVelocity < 0) {
    impactIndex = Math.min(
      frames.length - 1,
      Math.max(topIndex + 1, Math.floor(frames.length * 0.55)),
    );
    maxVelocity = 0;
  }

  // 4) finish = impact 이후 속도가 (피크 대비 상대 임계) 이하로 N프레임 유지
  const finishVelocityThreshold = Math.max(
    finishVelocityFloor,
    maxVelocity * finishVelocityPeakRatio,
  );
  let finishIndex = frames.length - 1;
  let stableCount = 0;
  let foundFinish: 'threshold' | 'soft' | null = null;
  for (let i = Math.max(1, impactIndex + 1); i < frames.length; i += 1) {
    const velocity = frameVelocity(frames[i - 1], frames[i], trailWristIndex);
    if (velocity <= finishVelocityThreshold) {
      stableCount += 1;
      if (stableCount >= finishStableFrameCount) {
        finishIndex = i;
        foundFinish = 'threshold';
        break;
      }
    } else {
      stableCount = 0;
    }
  }

  // soft: 임계에 못 미치면 impact 이후 후반부에서 가장 조용한 지점
  if (!foundFinish && frames.length > impactIndex + 3) {
    const searchStart = Math.min(
      frames.length - 1,
      impactIndex +
        Math.max(
          2,
          Math.floor(
            (frames.length - 1 - impactIndex) * FINISH_SOFT_SEARCH_START_RATIO,
          ),
        ),
    );
    let quietestIndex = frames.length - 1;
    let quietestScore = Number.POSITIVE_INFINITY;
    for (let i = searchStart; i < frames.length; i += 1) {
      const windowStart = Math.max(1, i - finishStableFrameCount + 1);
      let sum = 0;
      let count = 0;
      for (let j = windowStart; j <= i; j += 1) {
        sum += frameVelocity(frames[j - 1], frames[j], trailWristIndex);
        count += 1;
      }
      const avg = count > 0 ? sum / count : Number.POSITIVE_INFINITY;
      if (avg < quietestScore) {
        quietestScore = avg;
        quietestIndex = i;
      }
    }
    finishIndex = quietestIndex;
    foundFinish = 'soft';
  }

  if (!foundFinish) {
    finishIndex = frames.length - 1;
  }

  // 순서 보정: address ≤ top ≤ impact ≤ finish
  topIndex = Math.max(topIndex, addressIndex);
  impactIndex = Math.max(impactIndex, topIndex);
  finishIndex = Math.max(finishIndex, impactIndex);

  const tAddress = frames[addressIndex].timestampMs;
  const tTop = frames[topIndex].timestampMs;
  const tImpact = frames[impactIndex].timestampMs;
  const tFinish = frames[finishIndex].timestampMs;

  // 보간 4개
  const tToeUp = (tAddress + tTop) / 2;
  const tMidBackswing = (tToeUp + tTop) / 2;
  const tMidDownswing = (tTop + tImpact) / 2;
  const tMidFollow = (tImpact + tFinish) / 2;

  const phases: PhaseMarker[] = [
    marker('address', frames, addressIndex, 'detected'),
    interpolatedMarker('toe_up', frames, tToeUp),
    interpolatedMarker('mid_backswing', frames, tMidBackswing),
    marker('top', frames, topIndex, 'detected'),
    interpolatedMarker('mid_downswing', frames, tMidDownswing),
    marker('impact', frames, impactIndex, 'detected'),
    interpolatedMarker('mid_follow_through', frames, tMidFollow),
    marker('finish', frames, finishIndex, 'detected'),
  ];

  let warning: string | null = null;
  if (frames.length < 15) {
    warning = 'short sequence — phase estimates may be unreliable';
  } else if (!foundFinish) {
    warning = 'finish fallback to last frame (velocity never settled)';
  }

  return { phases, trailWristIndex, warning };
}
