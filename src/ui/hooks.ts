import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { CONCEPT_MAP } from '../content';
import { db } from '../db/db';
import { getDaily } from '../db/repo';
import type { DailyRecord, MasteryRecord } from '../engine/model';
import { makePlan } from '../engine/planner';
import { dayKey } from '../engine/util';

export function useSettings() {
  return useLiveQuery(() => db.settings.get('main'), []);
}

export function useMastery(): Map<string, MasteryRecord> | undefined {
  return useLiveQuery(async () => new Map((await db.mastery.toArray()).filter((m) => CONCEPT_MAP.has(m.conceptId)).map((m) => [m.conceptId, m])), []);
}

export function useDailyMap(): Map<string, DailyRecord> | undefined {
  return useLiveQuery(async () => new Map((await db.daily.toArray()).map((d) => [d.day, d])), []);
}

export function useToday() {
  return useLiveQuery(() => getDaily(dayKey()), []);
}

export function usePlan() {
  const settings = useSettings();
  const mastery = useMastery();
  if (!settings || !mastery) return undefined;
  return {
    settings,
    mastery,
    plan: makePlan({ startDate: settings.startDate, examDate: settings.examDate, today: dayKey(), dailyMinutes: settings.dailyMinutes, mastery }),
  };
}

/** 실제 학습 활동 시간 측정: 화면이 보일 때만 누적 */
export function useActiveTimer(resetKey: unknown) {
  const acc = useRef(0);
  const since = useRef<number | null>(performance.now());
  useEffect(() => {
    acc.current = 0;
    since.current = document.visibilityState === 'visible' ? performance.now() : null;
  }, [resetKey]);
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === 'hidden' && since.current !== null) {
        acc.current += performance.now() - since.current;
        since.current = null;
      } else if (document.visibilityState === 'visible' && since.current === null) since.current = performance.now();
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);
  return {
    stop(): number {
      const extra = since.current !== null ? performance.now() - since.current : 0;
      since.current = null;
      return Math.round(acc.current + extra);
    },
  };
}
