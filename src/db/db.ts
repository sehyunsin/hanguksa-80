// IndexedDB(Dexie). 사용자 학습 기록만 저장한다(콘텐츠는 앱 번들).
// 테이블 ↔ 요구사항 19절 데이터 모델 대응:
//   mastery = mastery + review_schedule, history = learning_history, wrongs = wrong_answers,
//   daily = daily_goals, exams = exam_results, papers/paperFiles = exam_papers(사용자 기기 내 PDF),
//   settings = user_settings, confusions = 개념 혼동 쌍, session = 이어서 학습하기 상태
// eras/units/lessons/concepts/persons/events/artifacts/questions/choices/sources/concept_relations/question_concepts
//   = 정적 콘텐츠(src/content). 문제·선택지는 개념의 사실에서 그때그때 생성한다.
import Dexie, { type Table } from 'dexie';
import type {
  ConfusionRecord,
  DailyRecord,
  ExamResult,
  HistoryRecord,
  MasteryRecord,
  PaperFile,
  PaperRecord,
  Settings,
  WrongRecord,
} from '../engine/model';
import type { SessionPlan } from '../engine/session';

export interface SessionState {
  id: 'current';
  plan: SessionPlan;
  index: number;
  results: { itemId: string; correct: boolean; ms: number }[];
  blockResults: Record<string, boolean[]>;
  activeMs: number;
  xp: number;
  startedAt: number;
  updatedAt: number;
}

export interface MockState {
  id: 'mock';
  kind: 'official' | 'generated';
  round?: number;
  title: string;
  questions?: { q: import('../engine/questions').Question; pts: number }[];
  answers: (number | null)[];
  startedAt: number;
  limitSec: number;
  isEvaluation: boolean;
}

export class StudyDB extends Dexie {
  mastery!: Table<MasteryRecord, string>;
  history!: Table<HistoryRecord, number>;
  wrongs!: Table<WrongRecord, number>;
  confusions!: Table<ConfusionRecord, string>;
  daily!: Table<DailyRecord, string>;
  exams!: Table<ExamResult, number>;
  papers!: Table<PaperRecord, number>;
  paperFiles!: Table<PaperFile, string>;
  settings!: Table<Settings, string>;
  session!: Table<SessionState, string>;
  mock!: Table<MockState, string>;

  constructor(name = 'hanguksa-study') {
    super(name);
    this.version(1).stores({
      mastery: 'conceptId, due, level',
      history: '++id, ts, day, conceptId, sessionId',
      wrongs: '++id, ts, conceptId, cause',
      confusions: 'pair, count',
      daily: 'day',
      exams: '++id, ts, kind, round',
      papers: 'round',
      paperFiles: 'id, round',
      settings: 'id',
      session: 'id',
      mock: 'id',
    });
  }
}

export const db = new StudyDB();

/** 백업 대상 테이블(문제지 PDF 파일은 용량 때문에 제외 — 공식 사이트에서 다시 받을 수 있음) */
export const BACKUP_TABLES = ['mastery', 'history', 'wrongs', 'confusions', 'daily', 'exams', 'papers', 'settings'] as const;
