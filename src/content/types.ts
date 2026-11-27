// 콘텐츠(정적, 앱 번들에 포함)와 사용자 학습 기록(IndexedDB)을 분리한다.
// 콘텐츠 ID는 안정적으로 유지해야 하며, 학습 기록은 이 ID로만 콘텐츠를 참조한다.

export type EraId =
  | 'pre'
  | 'gojoseon'
  | 'samguk'
  | 'nambuk'
  | 'goryeo'
  | 'joseon1'
  | 'joseon2'
  | 'gaehang'
  | 'ilje'
  | 'hyeondae'
  | 'theme';

export type ConceptKind =
  | 'person' // 인물(왕 포함)
  | 'event' // 사건
  | 'institution' // 제도·기구
  | 'policy' // 정책·법
  | 'state' // 나라·국가
  | 'group' // 단체·세력
  | 'culture' // 문화·사상·종교
  | 'artifact' // 문화유산·유물
  | 'book' // 책·기록
  | 'place' // 지역
  | 'period'; // 시대·시기

/** 잠정 중요도. 기출 분석 전 추정치이며, 기출 분석 데이터가 확보되면 실제 출제 빈도로 대체한다. */
export type Tier = 'A' | 'B' | 'C';

/** ai_draft: AI 초안(검증 대기) / partial: 일부 사실만 출처로 확인 / verified: 모든 사실·연도를 출처와 대조 완료 */
export type VerifyStatus = 'ai_draft' | 'partial' | 'verified';

/** 개념별 검증 기록(src/content/verification.json) */
export interface VerificationRecord {
  status: 'verified' | 'partial';
  checkedAt: string;
  sources: { title: string; url: string }[];
  /** 사실별 확인 방법: auto(본문 자동 대조) / term(핵심어 항목 역대조) / manual(사람 검토) */
  facts: Record<string, 'auto' | 'term' | 'manual' | 'unconfirmed'>;
  yearsOk: boolean;
  note?: string;
}

export interface SourceRef {
  label: string;
  url: string;
}

export interface Fact {
  id: string;
  conceptId: string;
  /** 주어 없는 서술어 형태. 예: "노비안검법을 실시하였다" */
  text: string;
  /** text 안에서 빈칸으로 만들 핵심어 */
  blank?: string;
  /** 비교용 정규화 키. 같은 키를 가진 사실은 '같은 내용'으로 본다(오답 선택지에서 제외). */
  key: string;
  /** 다른 개념에도 해당될 수 있는 일반적 서술 → 오답 선택지/OX 거짓 문장으로 쓰지 않는다. */
  generic: boolean;
}

export interface Concept {
  id: string;
  unitId: string;
  lessonId: string;
  era: EraId;
  kind: ConceptKind;
  /** 발문에 쓰는 명사. 예: 왕, 인물, 단체, 나라, 사건, 제도 */
  noun: string;
  name: string;
  aliases: string[];
  /** 표시용 시기. 예: "949~975 재위", "1876년" */
  when?: string;
  /** 연대 비교용 키(연도 + 월/100). 사건 순서 문제에 사용 */
  sort?: number;
  summary: string;
  body: string[];
  keys: string[];
  facts: Fact[];
  /** 이름 대신 (가)가 들어간 탐구 자료(사료 요지·대화 등) */
  clues: string[];
  confusers: string[];
  tier: Tier;
  status: VerifyStatus;
  refs: SourceRef[];
  /** 커리큘럼 전체 순서 */
  order: number;
  /** 서로 다른 주체(인물·단체 등)를 묶은 개념 → '자료로 대상 찾기(clue5)' 문제에 쓰지 않는다 */
  umbrella: boolean;
}

export interface Lesson {
  id: string;
  unitId: string;
  title: string;
  conceptIds: string[];
  order: number;
}

export interface Unit {
  id: string;
  no: number;
  title: string;
  subtitle: string;
  era: EraId;
  color: string;
  lessons: Lesson[];
}

export interface OfficialRound {
  round: number;
  date: string; // YYYY-MM-DD 시행일
  level: '심화';
  boardUrl: string; // 공식 시험자료실 게시물
}
