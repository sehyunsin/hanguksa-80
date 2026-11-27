// 사용자 학습 기록 데이터 모델(IndexedDB에 저장). 콘텐츠와 분리되어 콘텐츠를 업데이트해도 유지된다.
import type { QKind } from './questions';

export type Bucket = 'review' | 'new' | 'drill' | 'apply' | 'weak';
export const BUCKETS: Bucket[] = ['review', 'new', 'drill', 'apply', 'weak'];
export const BUCKET_LABEL: Record<Bucket, string> = {
  review: '기존 지식 복습',
  new: '새로운 지식 학습',
  drill: '인물·사건·업적 반복',
  apply: '기출 유형 응용',
  weak: '취약 개념 보충',
};

export type Confidence = 'sure' | 'unsure';

/** FSRS 카드(날짜는 ms) */
export interface CardData {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

/** mastery: 개념별 숙련도 + 간격 반복 일정(review_schedule) */
export interface MasteryRecord {
  conceptId: string;
  card: CardData;
  due: number;
  introducedAt?: number;
  firstStudied?: number;
  lastStudied?: number;
  seen: number;
  correct: number;
  wrong: number;
  streak: number;
  avgMs: number;
  lastMs: number;
  lastConfidence?: Confidence;
  /** 0 미학습, 1 소개됨, 2 쉬운 확인 통과, 3 회상·비교 통과, 4 기출형 통과(간격 후), 5 장기 기억 */
  level: number;
  passed: { kind: QKind; at: number }[];
  confidentWrong: number;
  lastReviewAt?: number;
}

export type WrongCause =
  | 'knowledge'
  | 'person_confusion'
  | 'era_confusion'
  | 'order_confusion'
  | 'achievement_confusion'
  | 'institution_confusion'
  | 'source_reading'
  | 'artifact_confusion'
  | 'misread'
  | 'slip'
  | 'false_memory'
  | 'concept_confusion';

export const CAUSE_LABEL: Record<WrongCause, string> = {
  knowledge: '역사 지식 부족',
  person_confusion: '인물 혼동',
  era_confusion: '시대 혼동',
  order_confusion: '사건 순서 혼동',
  achievement_confusion: '업적 혼동',
  institution_confusion: '정치·경제 제도 혼동',
  source_reading: '사료 해석 부족',
  artifact_confusion: '문화재 구분 실패',
  misread: '문제 발문 오독',
  slip: '단순 실수',
  false_memory: '확신을 가지고 잘못 기억',
  concept_confusion: '비슷한 사건·단체·나라 혼동',
};

/** learning_history: 모든 응답 기록 */
export interface HistoryRecord {
  id?: number;
  ts: number;
  day: string;
  sessionId: string;
  conceptId: string;
  kind: QKind | 'intro';
  bucket: Bucket;
  correct: boolean;
  ms: number;
  confidence?: Confidence;
  confusedWith?: string;
}

/** wrong_answers */
export interface WrongRecord {
  id?: number;
  ts: number;
  day: string;
  conceptId: string;
  kind: QKind;
  cause: WrongCause;
  userCause?: WrongCause;
  confusedWith?: string;
  prompt: string;
  userAnswer: string;
  correctAnswer: string;
  resolvedAt?: number;
}

export interface ConfusionRecord {
  pair: string; // 'a|b' (정렬)
  a: string;
  b: string;
  count: number;
  lastTs: number;
  resolvedCount: number;
}

/** daily_goals */
export interface DailyRecord {
  day: string;
  seconds: Record<Bucket, number>;
  items: number;
  correct: number;
  xp: number;
  sessions: number;
  newConcepts: number;
}

export type ExamKind = 'official' | 'generated';
/** exam_results (학습 문제 정답률과 별도로 저장) */
export interface ExamResult {
  id?: number;
  ts: number;
  day: string;
  kind: ExamKind;
  round?: number;
  title: string;
  score: number;
  maxScore: number;
  correctCount: number;
  total: number;
  durationSec: number;
  limitSec: number;
  withinTime: boolean;
  answers: (number | null)[];
  correctness: boolean[];
  isEvaluation: boolean;
  /** 창작 모의고사: 문항별 개념(취약 분석용) */
  conceptIds?: string[];
  points?: number[];
}

export interface AnswerKeyItem {
  ans: number; // 1~5 (0 = 미입력)
  pts: number; // 1~3
  /** 정답 없음(정정) → 전원 정답 처리 */
  all?: boolean;
  /** 복수 정답 */
  accept?: number[];
}

/** exam_papers: 사용자가 가져온 공식 기출 회차(문제지 PDF는 기기 안에만 저장) */
export interface PaperRecord {
  round: number;
  title: string;
  addedAt: number;
  hasQuestionPdf: boolean;
  answerKey?: AnswerKeyItem[];
  evaluationOnly: boolean;
}

export interface PaperFile {
  id: string; // `${round}-q`
  round: number;
  name: string;
  blob: Blob;
}

/** user_settings */
export interface Settings {
  id: 'main';
  startDate: string;
  examDate: string;
  dailyMinutes: number;
  sessionMinutes: number;
  theme: 'system' | 'light' | 'dark';
  xp: number;
  createdAt: number;
  askCause: boolean;
  initialWeakConceptIds: string[];
}

export const DEFAULT_SETTINGS = (today: string): Settings => ({
  id: 'main',
  startDate: today,
  examDate: '2027-02-13',
  dailyMinutes: 80,
  sessionMinutes: 10,
  theme: 'system',
  xp: 0,
  createdAt: Date.now(),
  askCause: true,
  // 사용자 진단 결과(요구사항 12절): 취약 개념
  initialWeakConceptIds: ['sl-beopheung', 'sl-jinheung', 'gr-gwangjong', 'jl-yeongjo', 'jl-jeongjo'],
});
