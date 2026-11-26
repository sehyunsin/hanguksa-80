// 학습 계획: 시작일~시험일 기간을 자동 계산하고, 단원 진도·하루 분량(버킷별 분)·신규 개념을 정한다.
// 요구사항의 79일 계획 표를 실제 기간에 비례하여 늘리거나 줄인다.
import { CONCEPTS, UNITS } from '../content';
import type { Concept } from '../content/types';
import type { Bucket, MasteryRecord } from './model';
import { importanceWeight } from './srs';
import { clamp, daysBetween } from './util';

/** 79일 기준 단원 일정(요구사항 6절). 두 단원이 한 구간을 공유하면 개념 수 비례로 나눈다. */
const BASE_TOTAL = 79;
const BASE_LEARN_END = 55;
const BASE_PAST_END = 69;
const BASE_RANGES: { units: string[]; start: number; end: number }[] = [
  { units: ['u1', 'u2'], start: 1, end: 7 },
  { units: ['u3', 'u4'], start: 8, end: 14 },
  { units: ['u5'], start: 15, end: 23 },
  { units: ['u6'], start: 24, end: 32 },
  { units: ['u7'], start: 33, end: 40 },
  { units: ['u8'], start: 41, end: 48 },
  { units: ['u9', 'u10'], start: 49, end: 55 },
];

/** 단계별 모의고사 목표 점수(요구사항 15절) */
export const STAGE_TARGETS = [
  { day: 15, score: 30 },
  { day: 30, score: 45 },
  { day: 45, score: 55 },
  { day: 60, score: 65 },
  { day: 70, score: 70 },
  { day: 79, score: 75 },
];

export interface UnitSchedule {
  unitId: string;
  startDay: number;
  endDay: number;
  count: number;
}

export interface Plan {
  dayIndex: number; // 1부터
  totalDays: number;
  daysLeft: number; // 시험일까지 남은 날(오늘 포함 X)
  phase: 0 | 1 | 2 | 3 | 4; // 0 시작 전, 1 전 시대 학습, 2 기출·오답, 3 실전, 4 시험 후
  phaseLabel: string;
  learnEnd: number;
  pastEnd: number;
  budgets: Record<Bucket, number>; // 분
  units: UnitSchedule[];
  currentUnitId: string;
  expectedIntroduced: number;
  introduced: number;
  behind: number;
  newQuota: number;
  priorityMode: boolean;
  mockDay: { day: number; score: number } | null;
  nextTarget: { day: number; score: number } | null;
}

export function scaleDay(d: number, from: number, to: number) {
  return Math.max(1, Math.round((d * to) / from));
}

export function unitSchedule(learnEnd: number): UnitSchedule[] {
  const out: UnitSchedule[] = [];
  for (const r of BASE_RANGES) {
    const start = Math.round(((r.start - 1) * learnEnd) / BASE_LEARN_END) + 1;
    const end = Math.max(start, Math.round((r.end * learnEnd) / BASE_LEARN_END));
    const counts = r.units.map((u) => CONCEPTS.filter((c) => c.unitId === u).length);
    const total = counts.reduce((a, b) => a + b, 0);
    const span = end - start + 1;
    let cursor = start;
    r.units.forEach((u, i) => {
      const len = i === r.units.length - 1 ? end - cursor + 1 : Math.max(1, Math.round((span * counts[i]) / total));
      out.push({ unitId: u, startDay: cursor, endDay: Math.max(cursor, cursor + len - 1), count: counts[i] });
      cursor = Math.min(end, cursor + len);
    });
  }
  return out;
}

const PHASE_BUDGET: Record<1 | 2 | 3, Record<Bucket, number>> = {
  1: { review: 20, new: 25, drill: 15, apply: 15, weak: 5 },
  2: { review: 25, new: 0, drill: 10, apply: 30, weak: 15 },
  3: { review: 20, new: 0, drill: 10, apply: 30, weak: 20 },
};

export function makePlan(p: {
  startDate: string;
  examDate: string;
  today: string;
  dailyMinutes: number;
  mastery: Map<string, MasteryRecord>;
}): Plan {
  const totalDays = Math.max(1, daysBetween(p.startDate, p.examDate));
  const dayIndex = daysBetween(p.startDate, p.today) + 1;
  const daysLeft = daysBetween(p.today, p.examDate);
  const learnEnd = Math.max(1, Math.round((totalDays * BASE_LEARN_END) / BASE_TOTAL));
  const pastEnd = Math.max(learnEnd, Math.round((totalDays * BASE_PAST_END) / BASE_TOTAL));
  const units = unitSchedule(learnEnd);

  const introducedSet = new Set([...p.mastery.values()].filter((m) => m.level > 0).map((m) => m.conceptId));
  const introduced = introducedSet.size;

  let phase: Plan['phase'];
  if (dayIndex < 1) phase = 0;
  else if (daysLeft < 0) phase = 4;
  else if (dayIndex <= learnEnd) phase = 1;
  else if (dayIndex <= pastEnd) phase = 2;
  else phase = 3;

  // 해당 날짜가 끝날 때까지 소개되어 있어야 할 개념 수
  const expectedBy = (day: number) =>
    Math.round(units.reduce((acc, u) => acc + u.count * clamp((clamp(day, 0, learnEnd) - u.startDay + 1) / (u.endDay - u.startDay + 1), 0, 1), 0));
  // 밀린 정도는 '어제까지' 기준으로 계산(오늘 분량은 아직 밀린 것이 아님)
  const expectedIntroduced = expectedBy(dayIndex - 1);
  const behind = Math.max(0, expectedIntroduced - introduced);
  const remaining = CONCEPTS.length - introduced;
  const perDayBase = Math.ceil(CONCEPTS.length / learnEnd);

  const scale = p.dailyMinutes / 80;
  const base = phase === 0 || phase === 4 ? PHASE_BUDGET[1] : PHASE_BUDGET[phase];
  const budgets = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * scale)])) as Record<Bucket, number>;

  let newQuota = 0;
  if (phase <= 1) {
    // 하루 분량 + 밀린 분량을 나누어 반영(하루 상한 = 기본의 2배)
    const todayTarget = expectedBy(dayIndex) - expectedIntroduced;
    // 앞서 있으면 그만큼 줄이되, 하루 최소 분량은 유지
    const ahead = Math.max(0, introduced - expectedIntroduced);
    newQuota = clamp(todayTarget + Math.ceil(behind / 2) - ahead, Math.ceil(perDayBase / 2), perDayBase * 2);
  } else if (remaining > 0) {
    // 2·3단계인데 아직 남은 개념이 있으면 시간 일부를 신규 학습에 배정(중요도 순)
    newQuota = Math.min(remaining, perDayBase);
    budgets.new = Math.round(10 * scale);
    budgets.apply -= Math.round(10 * scale);
  }
  const priorityMode = behind > perDayBase * 1.5 || phase >= 2;

  const currentUnit =
    units.find((u) => dayIndex >= u.startDay && dayIndex <= u.endDay)?.unitId ??
    (dayIndex < 1 ? 'u1' : nextUnintroducedUnit(introducedSet) ?? 'u10');

  const scaledTargets = STAGE_TARGETS.map((t) => ({ day: scaleDay(t.day, BASE_TOTAL, totalDays), score: t.score }));
  const mockDay = scaledTargets.find((t) => t.day === dayIndex) ?? null;
  const nextTarget = scaledTargets.find((t) => t.day >= dayIndex) ?? null;

  const phaseLabel =
    phase === 0
      ? '시작 전'
      : phase === 1
        ? '전 시대 기본 학습'
        : phase === 2
          ? '기출 유형·누적 오답 집중'
          : phase === 3
            ? '실전 모의고사·취약 개념 집중'
            : '시험 이후';

  return {
    dayIndex,
    totalDays,
    daysLeft,
    phase,
    phaseLabel,
    learnEnd,
    pastEnd,
    budgets,
    units,
    currentUnitId: currentUnit,
    expectedIntroduced,
    introduced,
    behind,
    newQuota,
    priorityMode,
    mockDay,
    nextTarget,
  };
}

function nextUnintroducedUnit(introduced: Set<string>): string | undefined {
  return UNITS.find((u) => CONCEPTS.some((c) => c.unitId === u.id && !introduced.has(c.id)))?.id;
}

/**
 * 오늘 새로 배울 개념 선택. 밀렸으면 이미 시작했어야 할 단원에서
 * 학습 중요도(실제 기출 등장 비율 + 잠정 중요도)가 높은 개념과 진단상 취약 개념부터.
 */
export function pickNewConcepts(plan: Plan, mastery: Map<string, MasteryRecord>, n: number, initialWeak: string[] = []): Concept[] {
  if (n <= 0) return [];
  const notYet = CONCEPTS.filter((c) => !(mastery.get(c.id)?.level ?? 0));
  const startedUnits = new Set(plan.units.filter((u) => u.startDay <= Math.max(1, plan.dayIndex)).map((u) => u.unitId));
  const weak = new Set(initialWeak);
  // 중요도를 0.5 단위 구간으로 묶어 비교(일관된 정렬) → 같은 구간 안에서는 커리큘럼 순서
  const band = (c: Concept) => Math.floor((importanceWeight(c.id) + (weak.has(c.id) ? 1.5 : 0)) * 2) / 2;
  const sorted = notYet.slice().sort((a, b) => {
    const sa = startedUnits.has(a.unitId) ? 0 : 1;
    const sb = startedUnits.has(b.unitId) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    if (plan.priorityMode) {
      const d = band(b) - band(a);
      if (d !== 0) return d;
    }
    return a.order - b.order;
  });
  return sorted.slice(0, n);
}

/** 필수 학습 범위(A·B 등급) 완료 여부: 모두 숙련도 3 이상 */
export function requiredCoverage(mastery: Map<string, MasteryRecord>) {
  const req = CONCEPTS.filter((c) => c.tier !== 'C');
  const done = req.filter((c) => (mastery.get(c.id)?.level ?? 0) >= 3).length;
  return { done, total: req.length, complete: done === req.length };
}
