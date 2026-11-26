// 간격 반복(FSRS) + 숙련도 단계 + 오답 원인 추정
// FSRS: ts-fsrs(오픈소스 FSRS 구현)를 사용. 초기 학습 단계 10분, 목표 기억 유지율 90%.
// 최대 간격은 시험일까지 남은 날수로 제한하여 시험 전에 반드시 다시 보게 한다.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade as FsrsGrade } from 'ts-fsrs';
import { CONCEPT_MAP } from '../content';
import { frequencyOf } from '../content/exams';
import type { CardData, Confidence, MasteryRecord, WrongCause } from './model';
import { KIND_TIER, type QKind } from './questions';

export { Rating, State };

export function makeScheduler(maxIntervalDays: number) {
  return fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: Math.max(1, Math.floor(maxIntervalDays)),
      enable_fuzz: true,
      enable_short_term: true,
      learning_steps: ['10m'],
      relearning_steps: ['10m'],
    }),
  );
}

export function toCardData(c: Card): CardData {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  };
}
export function fromCardData(d: CardData): Card {
  return {
    due: new Date(d.due),
    stability: d.stability,
    difficulty: d.difficulty,
    elapsed_days: d.elapsed_days,
    scheduled_days: d.scheduled_days,
    learning_steps: d.learning_steps ?? 0,
    reps: d.reps,
    lapses: d.lapses,
    state: d.state as State,
    last_review: d.last_review ? new Date(d.last_review) : undefined,
  };
}

export function newMastery(conceptId: string, now: number): MasteryRecord {
  const card = toCardData(createEmptyCard(new Date(now)));
  return {
    conceptId,
    card,
    due: card.due,
    seen: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    avgMs: 0,
    lastMs: 0,
    level: 0,
    passed: [],
    confidentWrong: 0,
  };
}

/** 기억 유지 추정치(0~1). 미학습이면 0 */
export function retrievability(m: MasteryRecord | undefined, now: number, maxIntervalDays = 3650): number {
  if (!m || m.level === 0 || m.card.state === State.New) return 0;
  const f = makeScheduler(maxIntervalDays);
  return f.get_retrievability(fromCardData(m.card), new Date(now), false) as number;
}

const SLOW_MS: Record<'easy' | 'recall' | 'exam', number> = { easy: 15000, recall: 30000, exam: 75000 };

export function ratingFor(correct: boolean, kind: QKind, ms: number, confidence: Confidence | undefined, level: number): FsrsGrade {
  if (!correct) return Rating.Again;
  const tier = KIND_TIER[kind];
  if (confidence === 'unsure') return Rating.Hard;
  if (ms > SLOW_MS[tier]) return Rating.Hard;
  if (tier === 'exam' && level >= 4 && ms < SLOW_MS[tier] / 3) return Rating.Easy;
  return Rating.Good;
}

/** 개념 소개 화면을 본 직후: 숙련도 1, 새 카드 */
export function markIntroduced(m: MasteryRecord, now: number): MasteryRecord {
  return {
    ...m,
    introducedAt: m.introducedAt ?? now,
    firstStudied: m.firstStudied ?? now,
    lastStudied: now,
    level: Math.max(1, m.level),
  };
}

export interface AnswerInput {
  kind: QKind;
  correct: boolean;
  ms: number;
  confidence?: Confidence;
  now: number;
  /** FSRS 일정에 반영할지(레슨 연속 문제는 블록 마지막에만 반영) */
  schedule: boolean;
  /** schedule=true 일 때 사용할 등급(없으면 ratingFor로 계산) */
  forcedRating?: FsrsGrade;
  maxIntervalDays: number;
}

const DAY = 86400000;

export function applyAnswer(m0: MasteryRecord, a: AnswerInput): MasteryRecord {
  const m: MasteryRecord = { ...m0, passed: m0.passed.slice() };
  m.seen += 1;
  m.lastStudied = a.now;
  m.firstStudied = m.firstStudied ?? a.now;
  m.introducedAt = m.introducedAt ?? a.now;
  m.lastMs = a.ms;
  m.avgMs = m.seen === 1 ? a.ms : Math.round(m.avgMs + (a.ms - m.avgMs) / m.seen);
  m.lastConfidence = a.confidence;
  const tier = KIND_TIER[a.kind];
  const prevReviewAt = m.lastReviewAt;

  if (a.correct) {
    m.correct += 1;
    m.streak += 1;
    m.passed.push({ kind: a.kind, at: a.now });
    if (m.passed.length > 30) m.passed = m.passed.slice(-30);
  } else {
    m.wrong += 1;
    m.streak = 0;
    if (a.confidence === 'sure') m.confidentWrong += 1;
  }

  if (a.schedule) {
    const f = makeScheduler(a.maxIntervalDays);
    const rating = a.forcedRating ?? ratingFor(a.correct, a.kind, a.ms, a.confidence, m.level);
    const res = f.next(fromCardData(m.card), new Date(a.now), rating);
    m.card = toCardData(res.card);
    // 퍼즈(fuzz)로 최대 간격을 넘는 경우를 막아 시험일 전에 반드시 다시 보게 한다
    const cap = Math.max(1, Math.floor(a.maxIntervalDays));
    if (m.card.scheduled_days > cap) {
      m.card.scheduled_days = cap;
      m.card.due = a.now + cap * DAY;
    }
    m.due = m.card.due;
    m.lastReviewAt = a.now;
  }

  // 숙련도 단계: 같은 문제 반복 암기를 막기 위해 '다른 유형' + '시간 간격'을 요구한다.
  if (a.correct) {
    const sinceIntro = a.now - (m.introducedAt ?? a.now);
    const spaced = prevReviewAt !== undefined && a.now - prevReviewAt >= 20 * 3600 * 1000;
    if (m.level < 1) m.level = 1;
    if (m.level === 1 && (tier === 'easy' || tier === 'recall' || tier === 'exam')) m.level = 2;
    else if (m.level === 2 && (tier === 'recall' || tier === 'exam') && sinceIntro >= 9 * 60 * 1000) m.level = 3;
    else if (m.level === 3 && tier === 'exam' && spaced) m.level = 4;
    else if (m.level === 4 && tier !== 'easy' && m.card.stability >= 21 && spaced && m.streak >= 2) m.level = 5;
  } else {
    if (m.level >= 4) m.level = 3;
    else if (m.level >= 2) m.level -= 1;
    if (a.confidence === 'sure' && m.level > 1) m.level -= 1;
    m.level = Math.max(1, m.level);
  }
  return m;
}

/** 레슨(신규 개념) 블록 결과 → 첫 FSRS 등급 */
export function lessonBlockRating(results: boolean[]): FsrsGrade {
  const wrong = results.filter((r) => !r).length;
  if (wrong === 0) return Rating.Good;
  if (wrong === 1) return Rating.Hard;
  return Rating.Again;
}

/** 오답 원인 추정 */
export function inferCause(p: {
  kind: QKind;
  conceptId: string;
  confusedWith?: string;
  confidence?: Confidence;
  ms: number;
  mastery?: MasteryRecord;
}): WrongCause {
  const m = p.mastery;
  if (p.kind === 'order' || p.kind === 'order5' || p.kind === 'year') return 'order_confusion';
  if (p.kind === 'era') return 'era_confusion';
  if (m && m.level >= 3 && p.ms < 2500) return 'slip';
  if (p.confidence === 'sure' && m && m.correct >= 2) return 'false_memory';
  const c = CONCEPT_MAP.get(p.conceptId);
  if (p.confusedWith && c) {
    const other = CONCEPT_MAP.get(p.confusedWith);
    if (c.kind === 'period' || (other && other.era !== c.era && c.era !== 'theme' && other.era !== 'theme')) return 'era_confusion';
    if (c.kind === 'artifact' || other?.kind === 'artifact') return 'artifact_confusion';
    if (c.kind === 'institution' || c.kind === 'policy') return 'institution_confusion';
    if (c.kind === 'person') return p.kind === 'mc_who' ? 'person_confusion' : 'achievement_confusion';
    return 'concept_confusion';
  }
  if (p.kind === 'clue5' && m && m.level >= 3) return 'source_reading';
  return 'knowledge';
}

/** FSRS 일정이 한 번이라도 잡힌 개념(소개만 하고 아직 문제를 끝내지 않은 개념 제외) */
export const isScheduled = (m: MasteryRecord | undefined) => !!m && m.level > 0 && m.card.state !== State.New;
export const isDue = (m: MasteryRecord | undefined, now: number) => !!m && m.level > 0 && m.due <= now;
export const conceptTierWeight = (id: string) => ({ A: 3, B: 2, C: 1 })[CONCEPT_MAP.get(id)?.tier ?? 'C'];

/**
 * 학습 중요도: 실제 기출 등장 비율(자동 분석, 60%) + 잠정 중요도(40%).
 * 자동 태깅에 오차가 있으므로 빈도만으로 정하지 않고 섞는다. 범위 약 1~5.6
 */
export function importanceWeight(id: string): number {
  const f = frequencyOf(id);
  return 0.4 * conceptTierWeight(id) + 0.6 * (1 + 4 * f.share);
}
export { DAY };
