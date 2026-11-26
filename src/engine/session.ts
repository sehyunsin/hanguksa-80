// 약 10분 단위 학습 세션 구성
// 하루 버킷별 남은 시간 비율이 가장 큰 버킷에서 한 단위씩 채워 넣어(탐욕적 배분) 하루 분량 비율을 지킨다.
import { CONCEPTS, CONCEPT_MAP, LESSON_MAP } from '../content';
import type { Concept } from '../content/types';
import type { Bucket, ConfusionRecord, MasteryRecord } from './model';
import { pickNewConcepts, type Plan } from './planner';
import {
  Balancer,
  KIND_SECONDS,
  generate,
  genCloze,
  genClue5,
  genFact,
  genMatch,
  genOrder,
  genSort2,
  genWho,
  type GenCtx,
  type QKind,
  type Question,
} from './questions';
import { importanceWeight, retrievability } from './srs';
import { shuffle, uid, type Rng } from './util';

export type SessionMode = 'daily' | 'review' | 'weak' | 'lesson' | 'concept' | 'apply';

export interface SessionItem {
  id: string;
  type: 'intro' | 'question';
  bucket: Bucket;
  conceptId: string;
  q?: Question;
  /** review: 답할 때 FSRS 반영 / block: 레슨 블록 끝에서 한 번 반영 / none: 반영 안 함 */
  schedule: 'review' | 'block' | 'none';
  blockEnd?: boolean;
  estSec: number;
  recheck?: boolean;
}

export interface SessionPlan {
  id: string;
  mode: SessionMode;
  title: string;
  items: SessionItem[];
  createdAt: number;
  estSec: number;
}

export interface BuildCtx {
  now: number;
  plan: Plan;
  mastery: Map<string, MasteryRecord>;
  confusions: ConfusionRecord[];
  spentToday: Record<Bucket, number>; // 초
  sessionSeconds: number;
  initialWeak: string[];
  rng: Rng;
  mode: SessionMode;
  lessonId?: string;
  conceptIds?: string[];
  withIntro?: boolean;
}

const INTRO_SEC = 75;

export function kindsForLevel(level: number, rng: Rng, lastKind?: QKind): QKind[] {
  let ks: QKind[];
  if (level <= 1) ks = shuffle(['mc_who', 'ox', 'mc_fact', 'cloze'], rng);
  else if (level === 2) ks = shuffle(['cloze', 'match', 'sort2', 'mc_fact', 'year', 'ox'], rng);
  else if (level === 3) ks = shuffle(['clue5', 'short', 'sort2', 'order', 'wrong5', 'year'], rng);
  else ks = shuffle(['clue5', 'wrong5', 'order5', 'short', 'clue5'], rng);
  // 직전에 통과한 유형은 뒤로 미룬다(같은 형태 반복 방지)
  if (lastKind) ks = [...ks.filter((k) => k !== lastKind), ...ks.filter((k) => k === lastKind)];
  return ks;
}

function makeCtx(b: BuildCtx, balancer: Balancer): GenCtx {
  const known = new Set([...b.mastery.values()].filter((m) => m.level > 0).map((m) => m.conceptId));
  return { rng: b.rng, balancer, known };
}

function qItem(q: Question, bucket: Bucket, schedule: SessionItem['schedule'], extra: Partial<SessionItem> = {}): SessionItem {
  return { id: uid(), type: 'question', bucket, conceptId: q.conceptId, q, schedule, estSec: KIND_SECONDS[q.kind], ...extra };
}

/** 신규 개념 레슨 블록: 소개 → 쉬운 확인 → 빈칸 → 짝 맞추기 → 비교 → 순서 → 기출 응용 */
export function lessonBlock(c: Concept, gctx: GenCtx, compact = false): SessionItem[] {
  const items: SessionItem[] = [{ id: uid(), type: 'intro', bucket: 'new', conceptId: c.id, schedule: 'none', estSec: INTRO_SEC }];
  const qs: (Question | null)[] = [
    genWho(c, gctx, 2),
    genFact(c, gctx, 3),
    genCloze(c, gctx, false),
    compact ? null : genMatch(c, gctx),
    genSort2(c, gctx),
    compact ? null : genOrder(c, gctx),
    genClue5(c, gctx),
  ];
  for (const q of qs) if (q) items.push(qItem(q, 'new', 'block'));
  if (items.length === 1) {
    const q = generate(c, ['ox'], gctx);
    items.push(qItem(q, 'new', 'block'));
  }
  items[items.length - 1].blockEnd = true;
  return items;
}

/** 10분 뒤 재확인 문제(세션 끝에 배치) */
function recheckItem(c: Concept, gctx: GenCtx): SessionItem {
  const q = generate(c, shuffle<QKind>(['short', 'cloze', 'ox', 'mc_fact'], gctx.rng), gctx);
  return qItem(q, 'new', 'review', { recheck: true });
}

function reviewPriority(m: MasteryRecord, now: number): number {
  const r = retrievability(m, now);
  const wrongRate = m.seen ? m.wrong / m.seen : 0;
  return (1 - r) * importanceWeight(m.conceptId) * (1 + wrongRate);
}

function weightedPick<T>(arr: T[], weight: (x: T) => number, rng: Rng): T | undefined {
  const total = arr.reduce((a, x) => a + Math.max(0.0001, weight(x)), 0);
  let r = rng() * total;
  for (const x of arr) {
    r -= Math.max(0.0001, weight(x));
    if (r <= 0) return x;
  }
  return arr[arr.length - 1];
}

export function buildSession(b: BuildCtx): SessionPlan {
  const balancer = new Balancer(b.rng);
  const gctx = makeCtx(b, balancer);
  const used = new Set<string>();
  const introduced = [...b.mastery.values()].filter((m) => m.level > 0);
  const target = b.sessionSeconds;
  const now = b.now;

  const dueList = introduced
    .filter((m) => m.due <= now)
    .sort((x, y) => reviewPriority(y, now) - reviewPriority(x, now));
  // 시험 직전(3일 이내): A등급 개념은 최근 2일 내 복습하지 않았다면 복습 대상에 추가
  if (b.plan.daysLeft >= 0 && b.plan.daysLeft <= 3) {
    for (const m of introduced) {
      if (CONCEPT_MAP.get(m.conceptId)?.tier === 'A' && (m.lastStudied ?? 0) < now - 2 * 86400000 && !dueList.includes(m)) dueList.push(m);
    }
  }

  const reviewQ = (m: MasteryRecord, bucket: Bucket = 'review'): SessionItem => {
    const c = CONCEPT_MAP.get(m.conceptId)!;
    const last = m.passed[m.passed.length - 1]?.kind;
    const q = generate(c, kindsForLevel(m.level, b.rng, last), gctx);
    return qItem(q, bucket, 'review');
  };

  const items: SessionItem[] = [];
  const rechecks: SessionItem[] = [];
  const add = (it: SessionItem) => {
    items.push(it);
    used.add(it.conceptId);
  };
  const est = () => items.reduce((a, x) => a + x.estSec, 0) + rechecks.reduce((a, x) => a + x.estSec, 0);

  if (b.mode === 'concept' && b.conceptIds?.length) {
    for (const id of b.conceptIds) {
      const c = CONCEPT_MAP.get(id);
      if (!c) continue;
      const m = b.mastery.get(id);
      if (!m || m.level === 0 || b.withIntro) {
        if (!m || m.level === 0) lessonBlock(c, gctx).forEach(add);
        else {
          add({ id: uid(), type: 'intro', bucket: 'weak', conceptId: c.id, schedule: 'none', estSec: INTRO_SEC });
          for (const k of kindsForLevel(m.level, b.rng).slice(0, 4)) add(qItem(generate(c, [k], gctx), 'weak', 'review'));
        }
      } else {
        for (const k of kindsForLevel(m.level, b.rng).slice(0, 4)) add(qItem(generate(c, [k], gctx), 'review', 'review'));
      }
    }
    return finish('개념 집중 연습');
  }

  if (b.mode === 'lesson' && b.lessonId) {
    const lesson = LESSON_MAP.get(b.lessonId);
    const concepts = (lesson?.conceptIds ?? []).map((id) => CONCEPT_MAP.get(id)!).filter(Boolean);
    const fresh = concepts.filter((c) => !(b.mastery.get(c.id)?.level ?? 0)).slice(0, 2);
    for (const c of fresh) {
      lessonBlock(c, gctx).forEach(add);
      rechecks.push(recheckItem(c, gctx));
    }
    if (!fresh.length) {
      for (const c of shuffle(concepts, b.rng)) {
        if (est() >= target) break;
        const m = b.mastery.get(c.id)!;
        add(reviewQ(m));
      }
    }
    return finish(lesson ? lesson.title : '레슨');
  }

  if (b.mode === 'review') {
    const list = dueList.length ? dueList : introduced.slice().sort((x, y) => retrievability(x, now) - retrievability(y, now));
    for (const m of list) {
      if (est() >= target) break;
      add(reviewQ(m));
    }
    return finish('복습');
  }

  if (b.mode === 'weak') {
    fillWeak(Infinity);
    return finish('취약 개념 집중');
  }

  if (b.mode === 'apply') {
    const pool = introduced.filter((m) => m.level >= 2);
    const list = shuffle(pool.length >= 5 ? pool : introduced, b.rng);
    for (const m of list) {
      if (est() >= target) break;
      const c = CONCEPT_MAP.get(m.conceptId)!;
      add(qItem(generate(c, shuffle<QKind>(['clue5', 'wrong5', 'order5', 'clue5'], b.rng), gctx), 'apply', 'review'));
    }
    return finish('기출 유형 집중');
  }

  // ── daily ──
  const budgetSec = Object.fromEntries(
    (Object.keys(b.plan.budgets) as Bucket[]).map((k) => [k, b.plan.budgets[k] * 60]),
  ) as Record<Bucket, number>;
  const remain = Object.fromEntries(
    (Object.keys(budgetSec) as Bucket[]).map((k) => [k, budgetSec[k] - (b.spentToday[k] ?? 0)]),
  ) as Record<Bucket, number>;
  const allDone = (Object.keys(remain) as Bucket[]).every((k) => remain[k] <= 0 || budgetSec[k] === 0);
  if (allDone) {
    // 오늘 목표 달성 후 추가 학습: 복습 중심
    remain.review = 300;
    remain.apply = 180;
    remain.weak = 120;
    remain.new = 0;
    remain.drill = 120;
  }

  const newToday = [...b.mastery.values()].filter((m) => m.introducedAt && sameDay(m.introducedAt, now)).length;
  const newLeft = Math.max(0, b.plan.newQuota - newToday);
  const newCands = pickNewConcepts(b.plan, b.mastery, newLeft, b.initialWeak);
  let newIdx = 0;
  let dueIdx = 0;
  const exhausted = new Set<Bucket>();

  const unitFor = (bucket: Bucket): SessionItem[] | null => {
    switch (bucket) {
      case 'new': {
        const c = newCands[newIdx++];
        if (!c) return null;
        rechecks.push(recheckItem(c, gctx));
        return lessonBlock(c, gctx, b.plan.priorityMode);
      }
      case 'review': {
        while (dueIdx < dueList.length && used.has(dueList[dueIdx].conceptId)) dueIdx++;
        const m = dueList[dueIdx++];
        return m ? [reviewQ(m)] : null;
      }
      case 'drill': {
        const pool = introduced.filter((m) => !used.has(m.conceptId) && ['person', 'event', 'group', 'state', 'institution', 'policy'].includes(CONCEPT_MAP.get(m.conceptId)!.kind));
        const m = weightedPick(pool, (x) => (CONCEPT_MAP.get(x.conceptId)!.unitId === b.plan.currentUnitId ? 3 : 1) * (6 - x.level), b.rng);
        if (!m) return null;
        const c = CONCEPT_MAP.get(m.conceptId)!;
        const kinds: QKind[] = shuffle(['match', 'mc_who', 'year', 'order', 'mc_fact'], b.rng);
        return [qItem(generate(c, kinds, gctx), 'drill', 'review')];
      }
      case 'apply': {
        let pool = introduced.filter((m) => !used.has(m.conceptId) && m.level >= 2);
        if (!pool.length) pool = introduced.filter((m) => !used.has(m.conceptId));
        const m = weightedPick(pool, (x) => importanceWeight(x.conceptId) * (x.level <= 3 ? 2 : 1), b.rng);
        if (!m) return null;
        const c = CONCEPT_MAP.get(m.conceptId)!;
        const kinds: QKind[] = m.level >= 3 ? shuffle(['clue5', 'wrong5', 'order5'], b.rng) : shuffle(['clue5', 'mc_fact', 'era'], b.rng);
        return [qItem(generate(c, kinds, gctx), 'apply', 'review')];
      }
      case 'weak': {
        const before = items.length;
        fillWeak(1);
        return items.length > before ? items.splice(before) : null;
      }
    }
  };

  let guard = 0;
  while (est() < target && guard++ < 80) {
    const order = (Object.keys(remain) as Bucket[])
      .filter((k) => !exhausted.has(k) && remain[k] > 0)
      .sort((x, y) => remain[y] / Math.max(1, budgetSec[y] || 300) - remain[x] / Math.max(1, budgetSec[x] || 300));
    if (!order.length) {
      // 모든 버킷이 비었으면 남은 복습/응용으로 채움
      if (!exhausted.has('review')) remain.review = 300;
      else if (!exhausted.has('apply')) remain.apply = 300;
      else break;
      continue;
    }
    const bucket = order[0];
    const unit = unitFor(bucket);
    if (!unit) {
      exhausted.add(bucket);
      continue;
    }
    unit.forEach(add);
    remain[bucket] -= unit.reduce((a, x) => a + x.estSec, 0);
  }

  return finish('오늘의 학습');

  function fillWeak(limit: number) {
    let n = 0;
    const pairs = b.confusions
      .filter((p) => p.count > p.resolvedCount)
      .sort((x, y) => y.count - y.resolvedCount - (x.count - x.resolvedCount));
    for (const p of pairs) {
      if (n >= limit || est() >= target) return;
      if (used.has(p.a) && used.has(p.b)) continue;
      const a = CONCEPT_MAP.get(p.a);
      if (!a) continue;
      const q = genSort2(a, gctx, p.b) ?? genMatch(a, gctx);
      if (q) {
        add(qItem(q, 'weak', 'review'));
        used.add(p.b);
        n++;
      }
    }
    const weakIds = new Set(b.initialWeak);
    const lows = introduced
      .filter((m) => !used.has(m.conceptId) && ((m.wrong > 0 && m.level <= 2) || (weakIds.has(m.conceptId) && m.level <= 3)))
      .sort((x, y) => y.wrong - x.wrong);
    for (const m of lows) {
      if (n >= limit || est() >= target) return;
      const c = CONCEPT_MAP.get(m.conceptId)!;
      add(qItem(generate(c, shuffle<QKind>(['cloze', 'ox', 'mc_fact', 'sort2'], b.rng), gctx), 'weak', 'review'));
      n++;
    }
  }

  function finish(title: string): SessionPlan {
    // 같은 개념이 연속으로 나오지 않게 정렬(레슨 블록은 묶음 유지)
    const ordered = interleave(items);
    const all = [...ordered, ...rechecks];
    return {
      id: uid(b.rng),
      mode: b.mode,
      title,
      items: all,
      createdAt: now,
      estSec: all.reduce((a, x) => a + x.estSec, 0),
    };
  }
}

function sameDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** 복습(워밍업) → 레슨 블록 → 반복 → 응용 → 취약 순. 같은 개념 연속 배치 최소화 */
function interleave(items: SessionItem[]): SessionItem[] {
  const rank: Record<Bucket, number> = { review: 0, new: 1, drill: 2, apply: 3, weak: 4 };
  const blocks: SessionItem[][] = [];
  let cur: SessionItem[] = [];
  for (const it of items) {
    if (it.bucket === 'new' && it.schedule !== 'review') {
      cur.push(it);
      if (it.blockEnd) {
        blocks.push(cur);
        cur = [];
      }
    } else blocks.push([it]);
  }
  if (cur.length) blocks.push(cur);
  blocks.sort((a, b) => rank[a[0].bucket] - rank[b[0].bucket]);
  // 같은 개념의 단일 문제가 바로 이어지면 뒤쪽 단일 문제와 자리를 바꾼다
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const b = blocks[i];
    if (b.length === 1 && prev[prev.length - 1].conceptId === b[0].conceptId) {
      const j = blocks.findIndex((x, k) => k > i && x.length === 1 && x[0].conceptId !== b[0].conceptId && x[0].bucket === b[0].bucket);
      if (j > 0) [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }
  }
  return blocks.flat();
}

export const allConceptIds = () => CONCEPTS.map((c) => c.id);
