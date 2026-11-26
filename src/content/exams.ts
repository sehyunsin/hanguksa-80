// 공식 기출(심화 제57~80회) 분석 결과 접근. 데이터 생성: npx tsx scripts/analyze-exams.ts
// 앱에는 정답·배점·자동 태그·통계만 들어 있고 문항 본문·이미지는 들어 있지 않다.
import type { AnswerKeyItem } from '../engine/model';
import raw from './examAnalysis.json';

export interface ExamTag {
  q: number;
  pts: number;
  ans: number[];
  type: string;
  primary: string | null;
  related: string[];
  correct: string | null;
  unit: string | null;
  era: string | null;
  confidence: 'high' | 'mid' | 'low' | 'none';
  source: 'text' | 'ocr';
}

interface Analysis {
  generatedAt: string;
  method: string;
  rounds: number[];
  keys: Record<string, { ans: number[]; pts: number }[]>;
  tags: Record<string, ExamTag[]>;
  frequency: Record<string, { q: number; rounds: number; primary: number }>;
  unitQuestionCount: Record<string, number>;
  taggedQuestions: number;
  totalQuestions: number;
}

export const ANALYSIS = raw as unknown as Analysis;
export const ANALYZED_ROUNDS = ANALYSIS.rounds.length;

/** 표본 검수(사람이 문항을 보고 자동 태그를 판정한 결과) */
export const SPOT_CHECK = [
  { round: 80, source: '텍스트', tagged: 49, conceptOk: 38, unitOk: 44, note: '개념 일치 약 76%(부분 일치 0.5로 계산), 단원 일치 88%' },
  { round: 67, source: 'OCR', tagged: 45, conceptOk: 39, unitOk: 43, note: '태그된 45문항 중 개념 일치 약 87%, 단원 일치 96%(5문항은 태그 보류)' },
];

/** 앱에 포함된 공식 정답표(정답 없음 → all: 전원 정답) */
export function officialKey(round: number): AnswerKeyItem[] | undefined {
  const k = ANALYSIS.keys[String(round)];
  if (!k) return undefined;
  return k.map((x) => ({
    ans: x.ans[0] ?? 0,
    pts: x.pts,
    ...(x.ans.length === 0 ? { all: true } : {}),
    ...(x.ans.length > 1 ? { accept: x.ans } : {}),
  }));
}

export function examTags(round: number): ExamTag[] | undefined {
  return ANALYSIS.tags[String(round)];
}

export interface Freq {
  rounds: number;
  questions: number;
  share: number; // 분석 회차 중 등장 비율
  level: '상' | '중' | '하' | '-';
}
export function frequencyOf(conceptId: string): Freq {
  const f = ANALYSIS.frequency[conceptId];
  if (!f) return { rounds: 0, questions: 0, share: 0, level: '-' };
  const share = f.rounds / ANALYZED_ROUNDS;
  return { rounds: f.rounds, questions: f.q, share, level: share >= 0.5 ? '상' : share >= 0.2 ? '중' : '하' };
}

/** 단원별 실제 출제 비중(자동 태그 기준) */
export function unitShare(): Record<string, number> {
  const total = Object.values(ANALYSIS.unitQuestionCount).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(ANALYSIS.unitQuestionCount).map(([u, n]) => [u, n / total]));
}
