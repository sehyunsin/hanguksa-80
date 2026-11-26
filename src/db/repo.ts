// 학습 기록 읽기/쓰기
import { CONCEPT_MAP, CONTENT_VERSION } from '../content';
import { gradeLabel } from '../engine/exam';
import { DAILY_GOAL_BONUS, SESSION_BONUS, xpFor } from '../engine/gamify';
import {
  BUCKETS,
  DEFAULT_SETTINGS,
  type Bucket,
  type Confidence,
  type DailyRecord,
  type ExamResult,
  type MasteryRecord,
  type Settings,
  type WrongCause,
} from '../engine/model';
import { makePlan, type Plan } from '../engine/planner';
import type { Grade, Question } from '../engine/questions';
import { buildSession, type SessionItem, type SessionMode } from '../engine/session';
import { applyAnswer, inferCause, lessonBlockRating, markIntroduced, newMastery } from '../engine/srs';
import { daysBetween, dayKey, mulberry32 } from '../engine/util';
import { BACKUP_TABLES, db, type SessionState, type StudyDB } from './db';

export async function getSettings(d: StudyDB = db): Promise<Settings> {
  const s = await d.settings.get('main');
  if (s) return s;
  const fresh = DEFAULT_SETTINGS(dayKey());
  await d.settings.put(fresh);
  return fresh;
}

export async function saveSettings(patch: Partial<Settings>, d: StudyDB = db) {
  const s = await getSettings(d);
  await d.settings.put({ ...s, ...patch, id: 'main' });
}

export async function masteryMap(d: StudyDB = db): Promise<Map<string, MasteryRecord>> {
  const all = await d.mastery.toArray();
  return new Map(all.map((m) => [m.conceptId, m]));
}

export const emptySeconds = (): Record<Bucket, number> => Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;

export async function getDaily(day = dayKey(), d: StudyDB = db): Promise<DailyRecord> {
  return (await d.daily.get(day)) ?? { day, seconds: emptySeconds(), items: 0, correct: 0, xp: 0, sessions: 0, newConcepts: 0 };
}

export async function currentPlan(d: StudyDB = db, today = dayKey()): Promise<{ plan: Plan; settings: Settings; mastery: Map<string, MasteryRecord> }> {
  const settings = await getSettings(d);
  const mastery = await masteryMap(d);
  const plan = makePlan({ startDate: settings.startDate, examDate: settings.examDate, today, dailyMinutes: settings.dailyMinutes, mastery });
  return { plan, settings, mastery };
}

export function maxIntervalDays(settings: Settings, today = dayKey()) {
  return Math.max(1, daysBetween(today, settings.examDate) - 1);
}

/** 새 세션 만들기(진행 중인 세션은 대체) */
export async function startSession(
  mode: SessionMode,
  opts: { lessonId?: string; conceptIds?: string[]; withIntro?: boolean } = {},
  d: StudyDB = db,
): Promise<SessionState> {
  const { plan, settings, mastery } = await currentPlan(d);
  const daily = await getDaily(dayKey(), d);
  const confusions = await d.confusions.toArray();
  const sp = buildSession({
    now: Date.now(),
    plan,
    mastery,
    confusions,
    spentToday: daily.seconds,
    sessionSeconds: settings.sessionMinutes * 60,
    initialWeak: settings.initialWeakConceptIds,
    rng: mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0),
    mode,
    ...opts,
  });
  const st: SessionState = {
    id: 'current',
    plan: sp,
    index: 0,
    results: [],
    blockResults: {},
    activeMs: 0,
    xp: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await d.session.put(st);
  return st;
}

export async function getSession(d: StudyDB = db) {
  const s = await d.session.get('current');
  if (s && s.index >= s.plan.items.length) return undefined;
  return s;
}

async function addDaily(day: string, bucket: Bucket, sec: number, patch: Partial<Pick<DailyRecord, 'items' | 'correct' | 'xp' | 'sessions' | 'newConcepts'>>, d: StudyDB) {
  const cur = await getDaily(day, d);
  cur.seconds = { ...emptySeconds(), ...cur.seconds };
  cur.seconds[bucket] += sec;
  for (const [k, v] of Object.entries(patch)) (cur as unknown as Record<string, number>)[k] += v as number;
  await d.daily.put(cur);
  return cur;
}

const ACTIVE_CAP_MS = 120000; // 한 항목당 인정하는 최대 학습 시간(방치 시간 제외)

/** 개념 소개 화면 완료 */
export async function recordIntro(st: SessionState, item: SessionItem, ms: number, d: StudyDB = db): Promise<SessionState> {
  const now = Date.now();
  const m0 = (await d.mastery.get(item.conceptId)) ?? newMastery(item.conceptId, now);
  const wasNew = !m0.introducedAt;
  await d.mastery.put(markIntroduced(m0, now));
  const eff = Math.min(ms, ACTIVE_CAP_MS);
  const xp = xpFor(undefined, true, true);
  await addDaily(dayKey(now), item.bucket, eff / 1000, { xp, newConcepts: wasNew ? 1 : 0 }, d);
  await d.history.add({ ts: now, day: dayKey(now), sessionId: st.plan.id, conceptId: item.conceptId, kind: 'intro', bucket: item.bucket, correct: true, ms: eff });
  const s = await getSettings(d);
  await saveSettings({ xp: s.xp + xp }, d);
  const next: SessionState = { ...st, index: st.index + 1, activeMs: st.activeMs + eff, xp: st.xp + xp, updatedAt: now };
  await d.session.put(next);
  return next;
}

export interface AnswerOutcome {
  state: SessionState;
  correct: boolean;
  cause?: WrongCause;
  wrongId?: number;
  xp: number;
  mastery: MasteryRecord;
}

/** 문제 응답 기록: 숙련도·FSRS·오답·혼동·일일 기록·XP */
export async function recordAnswer(
  st: SessionState,
  item: SessionItem,
  g: Grade,
  ms: number,
  confidence: Confidence | undefined,
  d: StudyDB = db,
): Promise<AnswerOutcome> {
  const q = item.q as Question;
  const now = Date.now();
  const settings = await getSettings(d);
  const eff = Math.min(ms, ACTIVE_CAP_MS);
  const m0 = (await d.mastery.get(item.conceptId)) ?? markIntroduced(newMastery(item.conceptId, now), now);
  const blockResults = { ...st.blockResults };
  let schedule = item.schedule === 'review';
  let forced;
  if (item.schedule === 'block') {
    blockResults[item.conceptId] = [...(blockResults[item.conceptId] ?? []), g.correct];
    if (item.blockEnd) {
      schedule = true;
      forced = lessonBlockRating(blockResults[item.conceptId]);
    }
  }
  // 같은 세션에서 같은 개념을 두 번째로 맞힌 경우에는 일정에 반영하지 않는다(단기 반복 과대평가 방지)
  if (schedule && item.schedule === 'review' && g.correct && m0.lastReviewAt && now - m0.lastReviewAt < 5 * 60000 && !item.recheck) schedule = false;

  const m = applyAnswer(m0, {
    kind: q.kind,
    correct: g.correct,
    ms: eff,
    confidence,
    now,
    schedule,
    forcedRating: forced,
    maxIntervalDays: maxIntervalDays(settings),
  });
  await d.mastery.put(m);

  let cause: WrongCause | undefined;
  let wrongId: number | undefined;
  if (!g.correct) {
    cause = inferCause({ kind: q.kind, conceptId: item.conceptId, confusedWith: g.confusedWith, confidence, ms: eff, mastery: m0 });
    wrongId = await d.wrongs.add({
      ts: now,
      day: dayKey(now),
      conceptId: item.conceptId,
      kind: q.kind,
      cause,
      confusedWith: g.confusedWith,
      prompt: [q.chip, q.prompt, ...(q.passage ?? [])].filter(Boolean).join(' / '),
      userAnswer: g.userAnswer,
      correctAnswer: g.correctAnswer,
    });
    if (g.confusedWith && CONCEPT_MAP.has(g.confusedWith)) {
      const [a, b] = [item.conceptId, g.confusedWith].sort();
      const pair = `${a}|${b}`;
      const cur = await d.confusions.get(pair);
      await d.confusions.put({ pair, a: item.conceptId, b: g.confusedWith, count: (cur?.count ?? 0) + 1, lastTs: now, resolvedCount: cur?.resolvedCount ?? 0 });
    }
  } else if (q.kind === 'sort2' || q.kind === 'match') {
    // 비교 문제를 맞히면 혼동 해소로 기록
    for (const other of q.relatedIds) {
      const [a, b] = [item.conceptId, other].sort();
      const cur = await d.confusions.get(`${a}|${b}`);
      if (cur && cur.count > cur.resolvedCount) await d.confusions.put({ ...cur, resolvedCount: cur.resolvedCount + 1 });
    }
  }

  const xp = xpFor(q, g.correct, false);
  await d.history.add({
    ts: now,
    day: dayKey(now),
    sessionId: st.plan.id,
    conceptId: item.conceptId,
    kind: q.kind,
    bucket: item.bucket,
    correct: g.correct,
    ms: eff,
    confidence,
    confusedWith: g.confusedWith,
  });
  const before = await getDaily(dayKey(now), d);
  const beforeSec = Object.values(before.seconds).reduce((a, b) => a + b, 0);
  const after = await addDaily(dayKey(now), item.bucket, eff / 1000, { items: 1, correct: g.correct ? 1 : 0, xp }, d);
  const afterSec = Object.values(after.seconds).reduce((a, b) => a + b, 0);
  let bonus = 0;
  if (beforeSec < settings.dailyMinutes * 60 && afterSec >= settings.dailyMinutes * 60) bonus = DAILY_GOAL_BONUS;
  if (bonus) await addDaily(dayKey(now), item.bucket, 0, { xp: bonus }, d);
  await saveSettings({ xp: settings.xp + xp + bonus }, d);

  const state: SessionState = {
    ...st,
    index: st.index + 1,
    results: [...st.results, { itemId: item.id, correct: g.correct, ms: eff }],
    blockResults,
    activeMs: st.activeMs + eff,
    xp: st.xp + xp + bonus,
    updatedAt: now,
  };
  await d.session.put(state);
  return { state, correct: g.correct, cause, wrongId, xp: xp + bonus, mastery: m };
}

export async function setUserCause(wrongId: number, cause: WrongCause, d: StudyDB = db) {
  await d.wrongs.update(wrongId, { userCause: cause });
}

/** 세션 종료: 완료 보너스 */
export async function finishSession(st: SessionState, d: StudyDB = db) {
  const now = Date.now();
  await addDaily(dayKey(now), 'review', 0, { sessions: 1, xp: SESSION_BONUS }, d);
  const s = await getSettings(d);
  await saveSettings({ xp: s.xp + SESSION_BONUS }, d);
  await d.session.delete('current');
  return { xp: st.xp + SESSION_BONUS };
}

export async function saveExamResult(r: Omit<ExamResult, 'id'>, d: StudyDB = db) {
  return d.exams.add(r as ExamResult);
}

export function examSummaryText(r: ExamResult) {
  return `${r.title} ${r.score}점(${gradeLabel(r.score)})`;
}

// ── 백업 / 복원 ──────────────────────────────────────────
export interface BackupFile {
  app: 'hanguksa-study';
  schema: 1;
  contentVersion: string;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(d: StudyDB = db): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) tables[t] = await d.table(t).toArray();
  return { app: 'hanguksa-study', schema: 1, contentVersion: CONTENT_VERSION, exportedAt: new Date().toISOString(), tables };
}

export async function importBackup(data: unknown, d: StudyDB = db): Promise<{ counts: Record<string, number> }> {
  const b = data as BackupFile;
  if (!b || b.app !== 'hanguksa-study' || typeof b.tables !== 'object') throw new Error('이 앱의 백업 파일이 아닙니다.');
  if (b.schema !== 1) throw new Error(`지원하지 않는 백업 형식입니다(schema ${b.schema}).`);
  const counts: Record<string, number> = {};
  await d.transaction('rw', BACKUP_TABLES.map((t) => d.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = Array.isArray(b.tables[t]) ? b.tables[t] : [];
      await d.table(t).clear();
      if (rows.length) await d.table(t).bulkPut(rows);
      counts[t] = rows.length;
    }
  });
  await d.session.clear();
  await d.mock.clear();
  return { counts };
}

export async function resetAll(d: StudyDB = db) {
  await Promise.all(d.tables.map((t) => t.clear()));
}
