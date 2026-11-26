// 실전 시험: 공식 배점 채점, 등급, 창작 모의고사 생성, 합격 준비도 판정, 답지 텍스트 파싱
import { CONCEPTS } from '../content';
import { unitShare } from '../content/exams';
import { EXAM_FORMAT } from '../content/official';
import type { AnswerKeyItem, ExamResult } from './model';
import { Balancer, genWho, generate, type GenCtx, type QKind, type Question } from './questions';
import { shuffle, type Rng } from './util';

export function gradeLabel(score: number): string {
  for (const g of EXAM_FORMAT.grades) if (score >= g.min) return g.grade;
  return '불합격';
}

export interface ScoreResult {
  score: number;
  maxScore: number;
  correctCount: number;
  correctness: boolean[];
}

export function scoreAnswers(key: AnswerKeyItem[], answers: (number | null)[]): ScoreResult {
  let score = 0;
  let correctCount = 0;
  const correctness = key.map((k, i) => {
    const a = answers[i];
    const ok = !!k.all || a === k.ans || (a !== null && !!k.accept?.includes(a));
    if (ok) {
      score += k.pts;
      correctCount++;
    }
    return ok;
  });
  return { score, maxScore: key.reduce((a, k) => a + k.pts, 0), correctCount, correctness };
}

export function validateKey(key: AnswerKeyItem[]): string[] {
  const errs: string[] = [];
  if (key.length !== EXAM_FORMAT.questions) errs.push(`문항 수가 ${key.length}개입니다(50개 필요).`);
  key.forEach((k, i) => {
    if (!k.all && !(k.ans >= 1 && k.ans <= 5)) errs.push(`${i + 1}번 정답이 비어 있거나 1~5가 아닙니다.`);
    if (!(k.pts >= 1 && k.pts <= 3)) errs.push(`${i + 1}번 배점이 1~3이 아닙니다.`);
  });
  const total = key.reduce((a, k) => a + (k.pts || 0), 0);
  if (total !== 100) errs.push(`배점 합계가 ${total}점입니다(100점이어야 함).`);
  return errs;
}

const CIRCLED: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };

/**
 * 답지 PDF에서 뽑은 텍스트를 정답·배점으로 해석(추정). 결과는 반드시 사용자가 확인·수정한다.
 * 지원 형태: (a) "번호 정답 배점" 이 반복되는 행 형태, (b) 번호 행/정답 행/배점 행이 나뉜 표 형태
 */
export function parseAnswerKeyText(text: string): { key: AnswerKeyItem[]; confidence: number } {
  const tokens = (text.match(/[①②③④⑤]|\d+/g) ?? []).map((t) => (t in CIRCLED ? { v: CIRCLED[t], circled: true } : { v: Number(t), circled: false }));
  const emptyKey = (): AnswerKeyItem[] => Array.from({ length: 50 }, () => ({ ans: 0, pts: 0 }));

  // (a) 행 형태: 각 줄을 "번호 정답 배점" 묶음으로 읽는다(공식 정답표 형식, ①~⑤ 또는 1~5, '없음')
  const a = emptyKey();
  let found = 0;
  for (const line of text.split('\n')) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let t = 0; t + 2 < toks.length; ) {
      const q = Number(toks[t]);
      const an = toks[t + 1];
      const p = Number(toks[t + 2]);
      let item: AnswerKeyItem | null = null;
      if (Number.isInteger(q) && q >= 1 && q <= 50 && p >= 1 && p <= 3) {
        if (an === '없음') item = { ans: 0, pts: p, all: true };
        else if (/^[①②③④⑤,]+$/.test(an)) {
          const list = [...an].filter((c) => c in CIRCLED).map((c) => CIRCLED[c]);
          item = { ans: list[0], pts: p, ...(list.length > 1 ? { accept: list } : {}) };
        } else if (/^[1-5]$/.test(an)) item = { ans: Number(an), pts: p };
      }
      if (item && !a[q - 1].pts) {
        a[q - 1] = item;
        found++;
        t += 3;
      } else t++;
    }
  }
  // 한 줄에 공백 없이 붙은 경우 등 대비: 토큰 순차 탐색으로 빈칸 보충
  {
    let i = 0;
    for (let n = 1; n <= 50 && i < tokens.length; n++) {
      if (a[n - 1].pts) continue;
      let j = i;
      while (j < tokens.length && !(tokens[j].v === n && !tokens[j].circled)) j++;
      if (j + 2 >= tokens.length) break;
      const ans = tokens[j + 1];
      const pts = tokens[j + 2];
      const needCircle = tokens.some((x) => x.circled);
      if (ans.v >= 1 && ans.v <= 5 && (!needCircle || ans.circled) && pts.v >= 1 && pts.v <= 3 && !pts.circled) {
        a[n - 1] = { ans: ans.v, pts: pts.v };
        found++;
        i = j + 3;
      } else i = j + 1;
    }
  }
  const totalA = a.reduce((s, k) => s + k.pts, 0);

  // (b) 표 형태: 번호 연속 → 정답 연속 → 배점 연속
  const b = emptyKey();
  let foundB = 0;
  for (let s = 0; s < tokens.length; s++) {
    if (tokens[s].v !== 1 || tokens[s].circled) continue;
    let len = 0;
    while (s + len < tokens.length && tokens[s + len].v === len + 1 && !tokens[s + len].circled) len++;
    if (len < 5) continue;
    const ansStart = s + len;
    const ptsStart = ansStart + len;
    const startNo = 1;
    let ok = true;
    for (let k = 0; k < len; k++) {
      const an = tokens[ansStart + k];
      const pt = tokens[ptsStart + k];
      if (!an || !pt || an.v < 1 || an.v > 5 || pt.v < 1 || pt.v > 3) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (let k = 0; k < len && startNo + k <= 50; k++) {
      b[startNo + k - 1] = { ans: tokens[ansStart + k].v, pts: tokens[ptsStart + k].v };
      foundB++;
    }
    break;
  }

  const pickA = found >= foundB;
  const key = pickA ? a : b;
  const cnt = pickA ? found : foundB;
  const total = pickA ? totalA : b.reduce((s, k) => s + k.pts, 0);
  const confidence = (cnt / 50) * (total === 100 ? 1 : 0.6);
  return { key, confidence };
}

/** 합격 준비도(요구사항 15절): 처음 보는 실제 기출 5회 평균 75점 이상, 최저 65점 이상, 모두 제한 시간 내 */
export function readiness(results: ExamResult[], coverageComplete: boolean) {
  const evals = results
    .filter((r) => r.kind === 'official' && r.isEvaluation)
    .sort((a, b) => b.ts - a.ts);
  const seen = new Set<number>();
  const firstTries = evals
    .slice()
    .reverse()
    .filter((r) => (r.round !== undefined && !seen.has(r.round) ? (seen.add(r.round), true) : false))
    .slice(-5);
  const avg = firstTries.length ? firstTries.reduce((a, r) => a + r.score, 0) / firstTries.length : 0;
  const min = firstTries.length ? Math.min(...firstTries.map((r) => r.score)) : 0;
  const checks = [
    { label: '필수 학습 범위(A·B 등급 개념 숙련도 3 이상) 완료', ok: coverageComplete },
    { label: `처음 보는 실제 기출 5회 응시 (${firstTries.length}/5)`, ok: firstTries.length >= 5 },
    { label: `5회 평균 75점 이상 (현재 ${firstTries.length ? avg.toFixed(1) : '-'}점)`, ok: firstTries.length >= 5 && avg >= 75 },
    { label: `5회 중 최저 65점 이상 (현재 ${firstTries.length ? min : '-'}점)`, ok: firstTries.length >= 5 && min >= 65 },
    { label: '모든 회차 제한 시간(80분) 안에 완료', ok: firstTries.length >= 5 && firstTries.every((r) => r.withinTime) },
  ];
  return { checks, ready: checks.every((c) => c.ok), firstTries, avg, min };
}

// ── 창작 문항 모의고사(실제 기출 아님) ─────────────────────
export interface MockQuestion {
  q: Question;
  pts: number;
}

/**
 * 50문항 창작 모의고사. 단원별 문항 수는 실제 기출 자동 분석의 단원별 비중을 따른다.
 * 배점: 1점 10문항 + 2점 30문항 + 3점 10문항 = 100점.
 */
export function generateMockExam(rng: Rng, onlyIds?: Set<string>): MockQuestion[] {
  const pool = CONCEPTS.filter((c) => !onlyIds || onlyIds.has(c.id));
  const src = pool.length >= 50 ? pool : CONCEPTS;
  const byUnit = new Map<string, typeof src>();
  for (const c of src) byUnit.set(c.unitId, [...(byUnit.get(c.unitId) ?? []), c]);
  const units = [...byUnit.keys()];
  // 단원별 문항 수: 실제 기출(57~80회) 자동 분석의 단원별 출제 비중. 분석 데이터가 없으면 개념 수 비례
  const share = unitShare();
  const hasShare = Object.keys(share).length > 0;
  const quota = new Map(
    units.map((u) => [u, Math.max(1, Math.round(50 * (hasShare ? (share[u] ?? 0) : byUnit.get(u)!.length / src.length)))]),
  );
  // 합계를 50으로 맞춤
  let sum = [...quota.values()].reduce((a, b) => a + b, 0);
  const sortedUnits = units.slice().sort((a, b) => byUnit.get(b)!.length - byUnit.get(a)!.length);
  let k = 0;
  while (sum !== 50) {
    const u = sortedUnits[k++ % sortedUnits.length];
    const v = quota.get(u)!;
    if (sum > 50 && v > 1) {
      quota.set(u, v - 1);
      sum--;
    } else if (sum < 50) {
      quota.set(u, v + 1);
      sum++;
    }
  }
  const ctx: GenCtx = { rng, balancer: new Balancer(rng) };
  const qs: Question[] = [];
  for (const u of units) {
    const cs = shuffle(byUnit.get(u)!, rng).sort((a, b) => (a.tier < b.tier ? -1 : a.tier > b.tier ? 1 : 0) + (rng() - 0.5));
    let ci = 0;
    for (let i = 0; i < quota.get(u)!; i++) {
      // 5지선다를 만들 수 있는 개념이 나올 때까지 다음 개념으로 넘어간다
      let q: Question | null = null;
      for (let tries = 0; tries < cs.length && !q; tries++) {
        const c = cs[ci++ % cs.length];
        const kinds: QKind[] = shuffle(['clue5', 'clue5', 'wrong5', 'order5'], rng);
        const cand = generate(c, kinds, ctx);
        if (cand.numbered && cand.choices?.length === 5) q = cand;
        else {
          const who = genWho(c, ctx, 5);
          if (who && who.choices?.length === 5) q = who;
        }
      }
      if (q) qs.push(q);
    }
  }
  // 문항 순서: 시대순(단원 순서 유지), 배점은 유형 난이도 기준
  const pts = qs.map((q) => (q.kind === 'order5' || q.kind === 'wrong5' ? 3 : q.numbered ? 2 : 1));
  // 100점으로 보정: 3점은 최대 10개, 1점 10개
  const idx = qs.map((_, i) => i);
  const three = shuffle(
    idx.filter((i) => pts[i] === 3),
    rng,
  );
  three.slice(10).forEach((i) => (pts[i] = 2));
  let threeCount = Math.min(10, three.length);
  for (const i of shuffle(idx, rng)) {
    if (threeCount >= 10) break;
    if (pts[i] === 2) {
      pts[i] = 3;
      threeCount++;
    }
  }
  let oneCount = pts.filter((p) => p === 1).length;
  for (const i of shuffle(idx, rng)) {
    if (oneCount >= 10) break;
    if (pts[i] === 2) {
      pts[i] = 1;
      oneCount++;
    }
  }
  for (const i of shuffle(idx, rng)) {
    if (oneCount <= 10) break;
    if (pts[i] === 1) {
      pts[i] = 2;
      oneCount--;
    }
  }
  return qs.map((q, i) => ({ q, pts: pts[i] }));
}

export function mockAnswerIndex(q: Question): number {
  return (q.choices ?? []).findIndex((c) => c.correct) + 1;
}
