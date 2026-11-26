import { describe, expect, it } from 'vitest';
import { CONCEPTS, CONCEPT_MAP } from '../src/content';
import { generateMockExam, gradeLabel, parseAnswerKeyText, readiness, scoreAnswers, validateKey } from '../src/engine/exam';
import type { ExamResult, MasteryRecord } from '../src/engine/model';
import { makePlan, pickNewConcepts, unitSchedule } from '../src/engine/planner';
import {
  Balancer,
  genClue5,
  genFact,
  genOrder,
  genOrder5,
  genOX,
  genWho,
  genWrong5,
  generate,
  grade,
  type GenCtx,
  type QKind,
} from '../src/engine/questions';
import { buildSession } from '../src/engine/session';
import { applyAnswer, importanceWeight, markIntroduced, newMastery, Rating } from '../src/engine/srs';
import { josa, mulberry32 } from '../src/engine/util';

const ctx = (seed = 1): GenCtx => ({ rng: mulberry32(seed), balancer: new Balancer(mulberry32(seed + 7)) });

describe('한글 조사', () => {
  it('받침에 따라 조사를 고른다', () => {
    expect(josa('광종', '은/는')).toBe('광종은');
    expect(josa('세조', '은/는')).toBe('세조는');
    expect(josa('6·25 전쟁', '이/가')).toBe('6·25 전쟁이');
    expect(josa('서울', '으로/로')).toBe('서울로');
    expect(josa('왕', '은/는')).toBe('왕은');
  });
});

describe('문제 생성 불변 조건(전체 개념)', () => {
  const kinds: QKind[] = ['ox', 'mc_who', 'mc_fact', 'cloze', 'short', 'match', 'sort2', 'order', 'order5', 'clue5', 'wrong5', 'era', 'year'];
  it('모든 개념·유형에서 정답이 정확히 하나이고 선택지 중복이 없다', () => {
    let made = 0;
    for (const c of CONCEPTS) {
      for (const k of kinds) {
        const q = generate(c, [k], ctx(made + 3));
        made++;
        if (q.choices) {
          expect(q.choices.filter((x) => x.correct).length, `${c.id}/${q.kind}`).toBe(1);
          const texts = q.choices.map((x) => x.text);
          expect(new Set(texts).size, `${c.id}/${q.kind} 중복 선택지: ${texts.join(' | ')}`).toBe(texts.length);
        }
        if (q.kind === 'match') expect(new Set(q.pairs!.map((p) => p.rightId)).size).toBe(q.pairs!.length);
        if (q.kind === 'order') {
          const sorts = q.correctOrder!.map((id) => CONCEPT_MAP.get(id)!.sort!);
          expect(sorts).toEqual([...sorts].sort((a, b) => a - b));
        }
      }
    }
    expect(made).toBeGreaterThan(2000);
  });

  it('오답 선택지(다른 개념의 사실)는 대상 개념의 사실 키와 겹치지 않는다', () => {
    for (const c of CONCEPTS) {
      const keys = new Set(c.facts.map((f) => f.key));
      for (const gen of [genFact, genClue5]) {
        const q = gen(c, ctx(11));
        if (!q) continue;
        for (const ch of q.choices!) {
          if (ch.correct) continue;
          const f = CONCEPTS.flatMap((x) => x.facts).find((x) => x.id === ch.id);
          if (f) expect(keys.has(f.key), `${c.id}: ${f.text}`).toBe(false);
        }
      }
      const w = genWrong5(c, ctx(5));
      if (w) {
        const bad = w.choices!.find((x) => x.correct)!;
        expect(bad.conceptId).not.toBe(c.id);
      }
      const ox = genOX(c, ctx(9), false);
      if (ox && ox.relatedIds[0]) {
        const fid = c.facts.map((f) => f.text);
        expect(fid.includes(ox.passage![0])).toBe(false);
      }
    }
  });

  it('누구 문제의 오답 후보는 해당 사실을 갖고 있지 않다', () => {
    for (const c of CONCEPTS) {
      const q = genWho(c, ctx(21), 4);
      if (!q) continue;
      const f = c.facts.find((x) => x.text === q.passage![0])!;
      for (const ch of q.choices!) if (!ch.correct) expect(CONCEPT_MAP.get(ch.id)!.facts.some((x) => x.key === f.key)).toBe(false);
    }
  });

  it('정답 위치가 특정 번호에 몰리지 않는다', () => {
    const b = new Balancer(mulberry32(3));
    const g: GenCtx = { rng: mulberry32(4), balancer: b };
    const counts = [0, 0, 0, 0, 0];
    for (const c of CONCEPTS) {
      const q = genClue5(c, g) ?? genWrong5(c, g);
      if (!q) continue;
      counts[q.choices!.findIndex((x) => x.correct)]++;
    }
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it('순서 문제는 보기를 섞어도 sort 값으로 채점한다', () => {
    const c = CONCEPT_MAP.get('gh-imo')!;
    const q = genOrder(c, ctx(2))!;
    expect(grade(q, { type: 'order', ids: q.correctOrder! }).correct).toBe(true);
    expect(grade(q, { type: 'order', ids: [...q.correctOrder!].reverse() }).correct).toBe(false);
    const q5 = genOrder5(c, ctx(3))!;
    const right = q5.choices!.find((x) => x.correct)!;
    expect(grade(q5, { type: 'choice', choiceId: right.id }).correct).toBe(true);
  });
});

describe('학습 계획', () => {
  it('2026-11-26 시작, 2027-02-13 시험 → 79일 계획', () => {
    const plan = makePlan({ startDate: '2026-11-26', examDate: '2027-02-13', today: '2026-11-26', dailyMinutes: 80, mastery: new Map() });
    expect(plan.totalDays).toBe(79);
    expect(plan.dayIndex).toBe(1);
    expect(plan.phase).toBe(1);
    expect(plan.currentUnitId).toBe('u1');
    expect(Object.values(plan.budgets).reduce((a, b) => a + b, 0)).toBe(80);
    expect(plan.newQuota).toBeGreaterThan(0);
  });
  it('단원 일정은 요구사항 표와 같다(79일 기준)', () => {
    const s = unitSchedule(55);
    const get = (u: string) => s.find((x) => x.unitId === u)!;
    expect(get('u1').startDay).toBe(1);
    expect(get('u2').endDay).toBe(7);
    expect(get('u5').startDay).toBe(15);
    expect(get('u5').endDay).toBe(23);
    expect(get('u7').startDay).toBe(33);
    expect(get('u8').endDay).toBe(48);
    expect(get('u10').endDay).toBe(55);
  });
  it('기간이 짧아지면 비례 축소된다', () => {
    const plan = makePlan({ startDate: '2026-12-20', examDate: '2027-02-13', today: '2026-12-20', dailyMinutes: 80, mastery: new Map() });
    expect(plan.totalDays).toBe(55);
    expect(plan.learnEnd).toBeLessThan(55);
    expect(plan.units[plan.units.length - 1].endDay).toBe(plan.learnEnd);
  });
  it('밀리면 시작된 단원에서 학습 중요도(기출 빈도+잠정 중요도)가 높은 개념부터 고른다', () => {
    const plan = makePlan({ startDate: '2026-11-26', examDate: '2027-02-13', today: '2026-12-20', dailyMinutes: 80, mastery: new Map() });
    expect(plan.behind).toBeGreaterThan(0);
    expect(plan.priorityMode).toBe(true);
    const picks = pickNewConcepts(plan, new Map(), 10);
    const started = new Set(plan.units.filter((u) => u.startDay <= plan.dayIndex).map((u) => u.unitId));
    expect(picks.every((c) => started.has(c.unitId))).toBe(true);
    const rest = CONCEPTS.filter((c) => started.has(c.unitId) && !picks.includes(c));
    const minPicked = Math.min(...picks.map((c) => importanceWeight(c.id)));
    const maxRest = Math.max(...rest.map((c) => importanceWeight(c.id)));
    expect(minPicked).toBeGreaterThanOrEqual(maxRest - 0.5);
    // 하루 상한: 기본 분량의 2배를 넘지 않음
    expect(plan.newQuota).toBeLessThanOrEqual(Math.ceil(CONCEPTS.length / plan.learnEnd) * 2);
  });
});

describe('세션 구성', () => {
  it('첫날 세션은 신규 개념 레슨 블록으로 시작하고 약 10분 분량이다', () => {
    const plan = makePlan({ startDate: '2026-11-26', examDate: '2027-02-13', today: '2026-11-26', dailyMinutes: 80, mastery: new Map() });
    const s = buildSession({
      now: Date.now(),
      plan,
      mastery: new Map(),
      confusions: [],
      spentToday: { review: 0, new: 0, drill: 0, apply: 0, weak: 0 },
      sessionSeconds: 600,
      initialWeak: [],
      rng: mulberry32(1),
      mode: 'daily',
    });
    expect(s.items[0].type).toBe('intro');
    expect(s.items.some((i) => i.blockEnd)).toBe(true);
    expect(s.estSec).toBeGreaterThan(300);
    expect(s.items.filter((i) => i.recheck).length).toBeGreaterThan(0);
  });
  it('학습한 개념이 있으면 복습·반복·응용 문제가 섞인다', () => {
    const now = Date.now();
    const mastery = new Map<string, MasteryRecord>();
    for (const c of CONCEPTS.slice(0, 30)) {
      let m = markIntroduced(newMastery(c.id, now - 3 * 86400000), now - 3 * 86400000);
      m = applyAnswer(m, { kind: 'ox', correct: true, ms: 5000, now: now - 3 * 86400000, schedule: true, maxIntervalDays: 70 });
      mastery.set(c.id, m);
    }
    const plan = makePlan({ startDate: '2026-11-26', examDate: '2027-02-13', today: '2026-11-29', dailyMinutes: 80, mastery });
    const s = buildSession({ now, plan, mastery, confusions: [], spentToday: { review: 0, new: 0, drill: 0, apply: 0, weak: 0 }, sessionSeconds: 600, initialWeak: [], rng: mulberry32(2), mode: 'daily' });
    const buckets = new Set(s.items.map((i) => i.bucket));
    expect(buckets.has('review')).toBe(true);
    expect(buckets.size).toBeGreaterThanOrEqual(3);
  });
});

describe('간격 반복(FSRS)과 숙련도', () => {
  it('정답이 이어지면 다음 복습 간격이 길어지고, 오답이면 짧아진다', () => {
    let t = Date.UTC(2026, 10, 26);
    let m = markIntroduced(newMastery('gr-gwangjong', t), t);
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      m = applyAnswer(m, { kind: 'clue5', correct: true, ms: 20000, now: t, schedule: true, maxIntervalDays: 79 });
      intervals.push((m.due - t) / 86400000);
      t = m.due;
    }
    expect(intervals[4]).toBeGreaterThan(intervals[1]);
    const before = m.due - t;
    m = applyAnswer(m, { kind: 'clue5', correct: false, ms: 20000, now: t, schedule: true, maxIntervalDays: 79 });
    expect(m.due - t).toBeLessThan(Math.max(before, 86400000));
    expect(m.level).toBeLessThanOrEqual(3);
  });
  it('최대 간격은 시험일까지로 제한된다', () => {
    let t = Date.UTC(2027, 0, 20);
    let m = markIntroduced(newMastery('x', t), t);
    for (let i = 0; i < 8; i++) {
      m = applyAnswer(m, { kind: 'clue5', correct: true, ms: 9000, now: t, schedule: true, maxIntervalDays: 20, forcedRating: Rating.Easy });
      t = m.due;
    }
    expect(m.card.scheduled_days).toBeLessThanOrEqual(20);
  });
  it('같은 날 연속 정답만으로는 숙련도 4가 되지 않는다(간격 필요)', () => {
    const t = Date.UTC(2026, 10, 26);
    let m = markIntroduced(newMastery('gr-gwangjong', t), t);
    for (let i = 0; i < 6; i++) m = applyAnswer(m, { kind: 'clue5', correct: true, ms: 9000, now: t + i * 11 * 60000, schedule: true, maxIntervalDays: 79 });
    expect(m.level).toBeLessThanOrEqual(3);
  });
});

describe('실전 시험', () => {
  it('등급 기준', () => {
    expect(gradeLabel(80)).toBe('1급');
    expect(gradeLabel(79)).toBe('2급');
    expect(gradeLabel(60)).toBe('3급');
    expect(gradeLabel(59)).toBe('불합격');
  });
  it('창작 모의고사는 50문항·100점·5지선다', () => {
    const exam = generateMockExam(mulberry32(5));
    expect(exam.length).toBe(50);
    expect(exam.reduce((a, x) => a + x.pts, 0)).toBe(100);
    expect(exam.every((x) => x.q.choices?.length === 5)).toBe(true);
  });
  it('배점 채점', () => {
    const key = Array.from({ length: 50 }, (_, i) => ({ ans: (i % 5) + 1, pts: i < 10 ? 1 : i < 40 ? 2 : 3 }));
    expect(validateKey(key)).toEqual([]);
    const ans = key.map((k) => k.ans);
    expect(scoreAnswers(key, ans).score).toBe(100);
    ans[45] = null as unknown as number;
    expect(scoreAnswers(key, ans).score).toBe(97);
  });
  it('답지 텍스트 해석: 행 형태', () => {
    const key = Array.from({ length: 50 }, (_, i) => ({ ans: ((i * 3) % 5) + 1, pts: i < 10 ? 1 : i < 40 ? 2 : 3 }));
    const circ = ['①', '②', '③', '④', '⑤'];
    const text = '제80회 심화 정답표 문항번호 정답 배점 ' + key.map((k, i) => `${i + 1} ${circ[k.ans - 1]} ${k.pts}`).join(' ');
    const r = parseAnswerKeyText(text);
    expect(r.key).toEqual(key);
    expect(r.confidence).toBe(1);
  });
  it('답지 텍스트 해석: 표 형태(번호 행/정답 행/배점 행)', () => {
    const key = Array.from({ length: 50 }, (_, i) => ({ ans: ((i * 2) % 5) + 1, pts: i % 2 ? 2 : i < 20 ? 1 : 3 }));
    const text = `${key.map((_, i) => i + 1).join(' ')} ${key.map((k) => k.ans).join(' ')} ${key.map((k) => k.pts).join(' ')}`;
    const r = parseAnswerKeyText(text);
    expect(r.key.map((k) => k.ans)).toEqual(key.map((k) => k.ans));
  });
  it('합격 준비도: 처음 본 5회 평균 75·최저 65·시간 내', () => {
    const mk = (round: number, score: number, within = true): ExamResult => ({
      ts: round,
      day: '2027-02-01',
      kind: 'official',
      round,
      title: `${round}회`,
      score,
      maxScore: 100,
      correctCount: 0,
      total: 50,
      durationSec: 4000,
      limitSec: 4800,
      withinTime: within,
      answers: [],
      correctness: [],
      isEvaluation: true,
    });
    expect(readiness([mk(76, 80), mk(77, 76), mk(78, 70), mk(79, 78), mk(80, 72)], true).ready).toBe(true);
    expect(readiness([mk(76, 80), mk(77, 76), mk(78, 60), mk(79, 90), mk(80, 80)], true).ready).toBe(false);
    expect(readiness([mk(76, 80), mk(77, 76), mk(78, 70)], true).ready).toBe(false);
  });
});

describe('묶음 개념 보호', () => {
  it('여러 주체를 묶은 개념은 자료형(clue5) 문제를 만들지 않는다', async () => {
    const { UMBRELLA_IDS } = await import('../src/content');
    for (const id of UMBRELLA_IDS) expect(genClue5(CONCEPT_MAP.get(id)!, ctx(1))).toBeNull();
  });
});
