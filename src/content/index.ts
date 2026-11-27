import { buildUnit } from './dsl';
import type { Concept, EraId, Fact, Lesson, Unit, VerificationRecord } from './types';
import verificationData from './verification.json';
import u01 from './units/u01';
import u02 from './units/u02';
import u03 from './units/u03';
import u04 from './units/u04';
import u05 from './units/u05';
import u06 from './units/u06';
import u07 from './units/u07';
import u08 from './units/u08';
import u09 from './units/u09';
import u10 from './units/u10';

/** 콘텐츠 버전. 콘텐츠를 수정하면 올린다(학습 기록에는 영향 없음). */
export const CONTENT_VERSION = '2026.11.27-4';

const built = [u01, u02, u03, u04, u05, u06, u07, u08, u09, u10].map(buildUnit);

/**
 * 서로 다른 주체의 사실을 함께 담은 '묶음 개념'. 자료 속 주체와 정답 선택지의 주체가 달라지는
 * 잘못된 문제를 막기 위해 clue5(자료 → 대상 파악) 유형에서 제외한다.
 */
export const UMBRELLA_IDS = new Set([
  'art-gg-tomb', 'art-bj', 'art-sl', 'ns-bulguksa', 'gr-architecture', 'gr-revolts', 'gr-waegu',
  'js-art1', 'js-buncheong', 'jl-art', 'jl-history-books', 'jl-architecture', 'jl-ilseongnok',
  'gh-boanhoe', 'gh-press', 'gh-facilities', 'gh-dokdo', 'ij-abroad1910', 'ij-youth', 'ij-amtae',
  'ij-literacy', 'ij-religion', 'th-seongnihak', 'th-currency', 'th-medical', 'th-jongmyo', 'th-sahak', 'th-seonggyungwan',
]);
for (const b of built) for (const c of b.concepts) if (UMBRELLA_IDS.has(c.id)) c.umbrella = true;

/** 대조에 쓴 출처 사이트(검증 기록의 URL로 판별) */
export const SOURCE_SITES = [
  { host: 'encykorea.aks.ac.kr', name: '한국민족문화대백과사전' },
  { host: 'contents.history.go.kr', name: '우리역사넷(국사편찬위원회)' },
] as const;
export const sourceSiteName = (url: string) => SOURCE_SITES.find((s) => url.includes(s.host))?.name ?? '출처';

/** 출처 대조 결과 반영: 상태와 실제 대조한 항목 링크 */
export const VERIFICATION = verificationData as unknown as Record<string, VerificationRecord>;
for (const b of built)
  for (const c of b.concepts) {
    const v = VERIFICATION[c.id];
    if (!v) continue;
    c.status = v.status;
    c.refs = [...v.sources.map((s) => ({ label: `${sourceSiteName(s.url)} 「${s.title}」`, url: s.url })), ...c.refs];
  }

export const UNITS: Unit[] = built.map((b) => b.unit);
export const CONCEPTS: Concept[] = built.flatMap((b) => b.concepts);
export const CONCEPT_MAP: Map<string, Concept> = new Map(CONCEPTS.map((c) => [c.id, c]));
export const LESSONS: Lesson[] = UNITS.flatMap((u) => u.lessons);
export const LESSON_MAP: Map<string, Lesson> = new Map(LESSONS.map((l) => [l.id, l]));
export const UNIT_MAP: Map<string, Unit> = new Map(UNITS.map((u) => [u.id, u]));
export const FACTS: Fact[] = CONCEPTS.flatMap((c) => c.facts);
export const FACT_MAP: Map<string, Fact> = new Map(FACTS.map((f) => [f.id, f]));

/** UNIT 11(실전 시험 대비)은 새 개념이 없는 실전 단원이므로 지도에서만 별도로 표시한다. */
export const EXAM_UNIT = {
  id: 'u11',
  no: 11,
  title: '실전 시험 대비',
  subtitle: '기출 회차 모의고사·시대 혼합·취약 개념 집중',
  color: '#34495e',
};

export const ERA_LABEL: Record<EraId, string> = {
  pre: '선사 시대',
  gojoseon: '고조선과 여러 나라',
  samguk: '삼국 시대',
  nambuk: '남북국 시대',
  goryeo: '고려 시대',
  joseon1: '조선 전기',
  joseon2: '조선 후기',
  gaehang: '개항기·대한 제국',
  ilje: '일제 강점기',
  hyeondae: '현대',
  theme: '통합(시대 공통)',
};

/** 시대 구분 문제에 쓰는 시대 목록(통합 제외) */
export const ERA_ORDER: EraId[] = ['pre', 'gojoseon', 'samguk', 'nambuk', 'goryeo', 'joseon1', 'joseon2', 'gaehang', 'ilje', 'hyeondae'];

export function conceptsOfUnit(unitId: string): Concept[] {
  return CONCEPTS.filter((c) => c.unitId === unitId);
}

export function getConcept(id: string): Concept {
  const c = CONCEPT_MAP.get(id);
  if (!c) throw new Error(`unknown concept ${id}`);
  return c;
}

/** 콘텐츠 무결성 검사. 문제 목록을 반환(테스트와 개발 화면에서 사용). */
export function validateContent(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const id of UMBRELLA_IDS) if (!CONCEPT_MAP.has(id)) problems.push(`없는 묶음 개념 ${id}`);
  for (const c of CONCEPTS) {
    if (ids.has(c.id)) problems.push(`중복 ID: ${c.id}`);
    ids.add(c.id);
    if (c.facts.length === 0) problems.push(`${c.id}: 사실(fact) 없음`);
    if (!c.body.length) problems.push(`${c.id}: 설명 없음`);
    for (const cf of c.confusers) if (!CONCEPT_MAP.has(cf)) problems.push(`${c.id}: 없는 혼동 개념 ${cf}`);
    for (const f of c.facts) {
      if (f.blank && !f.text.includes(f.blank)) problems.push(`${f.id}: 빈칸어가 본문에 없음`);
    }
    const keys = new Set<string>();
    for (const f of c.facts) {
      if (keys.has(f.key)) problems.push(`${c.id}: 같은 키의 사실 중복(${f.key})`);
      keys.add(f.key);
    }
    for (const cl of c.clues) {
      if (!cl.includes('(가)') && !cl.startsWith('“') && !/^\d|^제\d/.test(cl)) {
        // 사료형 자료는 (가) 없이도 허용 — 경고만
      }
    }
  }
  return problems;
}
