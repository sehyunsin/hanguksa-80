// 게임 요소. 경험치는 '실제 학습 활동'에만 주고, 같은 개념 반복으로 부풀릴 수 없게 한다.
import { CONCEPTS, UNITS } from '../content';
import type { DailyRecord, ExamResult, MasteryRecord, WrongRecord } from './model';
import type { Question } from './questions';
import { addDays, dayKey } from './util';

export function xpFor(q: Question | undefined, correct: boolean, isIntro: boolean): number {
  if (isIntro) return 3;
  if (!q) return 0;
  if (!correct) return 1; // 노력 보상(오답도 학습)
  return q.difficulty === 3 ? 12 : q.difficulty === 2 ? 8 : 5;
}

export const SESSION_BONUS = 20;
export const DAILY_GOAL_BONUS = 50;

export function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 60)) + 1;
  const cur = 60 * (level - 1) ** 2;
  const next = 60 * level ** 2;
  return { level, cur, next, progress: (xp - cur) / (next - cur) };
}

const totalSec = (d?: DailyRecord) => (d ? Object.values(d.seconds).reduce((a, b) => a + b, 0) : 0);

/** 연속 학습일: 하루 10분(600초) 이상 학습한 날이 이어진 수(오늘 미학습이면 어제까지) */
export function streak(daily: Map<string, DailyRecord>, today = dayKey()): number {
  let n = 0;
  let d = today;
  if (totalSec(daily.get(d)) < 600) d = addDays(d, -1);
  while (totalSec(daily.get(d)) >= 600) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function weekSummary(daily: Map<string, DailyRecord>, dailyMinutes: number, today = dayKey()) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const minutes = days.map((d) => Math.round(totalSec(daily.get(d)) / 60));
  const goalDays = minutes.filter((m) => m >= dailyMinutes).length;
  return { days, minutes, goalDays, total: minutes.reduce((a, b) => a + b, 0), target: dailyMinutes * 7 };
}

export interface Badge {
  id: string;
  label: string;
  desc: string;
  earned: boolean;
  progress?: string;
}

export function badges(p: {
  mastery: Map<string, MasteryRecord>;
  daily: Map<string, DailyRecord>;
  wrongs: WrongRecord[];
  exams: ExamResult[];
}): Badge[] {
  const out: Badge[] = [];
  for (const u of UNITS) {
    const cs = CONCEPTS.filter((c) => c.unitId === u.id);
    const mastered = cs.filter((c) => (p.mastery.get(c.id)?.level ?? 0) >= 4).length;
    out.push({
      id: `master-${u.id}`,
      label: `${u.title} 마스터`,
      desc: '단원 개념의 80% 이상을 숙련도 4(간격 후 기출형 통과) 이상으로',
      earned: mastered / cs.length >= 0.8,
      progress: `${mastered}/${cs.length}`,
    });
  }
  const wrongConcepts = new Set(p.wrongs.map((w) => w.conceptId));
  const overcome = [...wrongConcepts].filter((id) => (p.mastery.get(id)?.level ?? 0) >= 4).length;
  for (const n of [5, 20, 50]) {
    out.push({ id: `overcome-${n}`, label: `오답 극복 ${n}`, desc: '틀렸던 개념을 숙련도 4 이상으로 끌어올리기', earned: overcome >= n, progress: `${overcome}/${n}` });
  }
  const s = streak(p.daily);
  for (const n of [3, 7, 30]) out.push({ id: `streak-${n}`, label: `${n}일 연속 학습`, desc: '하루 10분 이상 연속 학습', earned: s >= n, progress: `${s}/${n}` });
  out.push({ id: 'first-mock', label: '첫 실전 모의고사', desc: '실전 시험을 처음 끝까지 응시', earned: p.exams.length > 0 });
  out.push({ id: 'pass-3', label: '3급 점수 돌파', desc: '실제 기출 모의고사 60점 이상', earned: p.exams.some((e) => e.kind === 'official' && e.score >= 60) });
  return out;
}
