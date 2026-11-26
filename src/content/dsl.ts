// 콘텐츠 작성용 간결한 표기법(DSL).
// 사실(fact) 표기: "[노비안검법]을 실시하였다" → blank='노비안검법'
//                  "~왕권을 강화하였다"      → generic(오답 선택지로 쓰지 않음)
//                  "...{k:키}"               → 비교 키 직접 지정 (같은 내용을 다른 개념이 공유할 때)
import type { Concept, ConceptKind, EraId, Fact, Lesson, SourceRef, Tier, Unit, VerifyStatus } from './types';

export interface ConceptInput {
  id: string;
  name: string;
  kind: ConceptKind;
  noun?: string;
  aliases?: string[];
  when?: string;
  sort?: number;
  tier: Tier;
  sum: string;
  body: string[];
  keys: string[];
  facts: string[];
  clues?: string[];
  cf?: string[];
  era?: EraId;
  /** 출처 검색어(기본: name) */
  q?: string;
  status?: VerifyStatus;
  /** 여러 주체를 묶은 개념 */
  umb?: boolean;
}

export interface LessonInput {
  id: string;
  title: string;
  concepts: ConceptInput[];
}

export interface UnitInput {
  id: string;
  no: number;
  title: string;
  subtitle: string;
  era: EraId;
  color: string;
  lessons: LessonInput[];
}

const DEFAULT_NOUN: Record<ConceptKind, string> = {
  person: '인물',
  event: '사건',
  institution: '제도',
  policy: '정책',
  state: '나라',
  group: '단체',
  culture: '문화',
  artifact: '문화유산',
  book: '책',
  place: '지역',
  period: '시기',
};

export const normKey = (s: string) => s.replace(/[\s·.,()「」『』'"‘’“”]/g, '').toLowerCase();

export function parseFact(conceptId: string, idx: number, raw: string): Fact {
  let s = raw.trim();
  let generic = false;
  if (s.startsWith('~')) {
    generic = true;
    s = s.slice(1).trim();
  }
  let key: string | undefined;
  const km = s.match(/\{k:([^}]+)\}\s*$/);
  if (km) {
    key = km[1].trim();
    s = s.slice(0, km.index).trim();
  }
  let blank: string | undefined;
  const bm = s.match(/\[([^\]]+)\]/);
  if (bm) {
    blank = bm[1];
    s = s.replace(/\[([^\]]+)\]/g, '$1');
  }
  return {
    id: `${conceptId}#${idx}`,
    conceptId,
    text: s,
    blank,
    key: normKey(key ?? blank ?? s),
    generic,
  };
}

export function sourceRefs(query: string): SourceRef[] {
  const q = encodeURIComponent(query);
  return [
    { label: '한국민족문화대백과사전 검색', url: `https://encykorea.aks.ac.kr/Article/Search?query=${q}` },
  ];
}

let orderCounter = 0;

export function buildUnit(input: UnitInput): { unit: Unit; concepts: Concept[] } {
  const concepts: Concept[] = [];
  const lessons: Lesson[] = input.lessons.map((l, li) => {
    const ids: string[] = [];
    for (const c of l.concepts) {
      ids.push(c.id);
      concepts.push({
        id: c.id,
        unitId: input.id,
        lessonId: l.id,
        era: c.era ?? input.era,
        kind: c.kind,
        noun: c.noun ?? DEFAULT_NOUN[c.kind],
        name: c.name,
        aliases: c.aliases ?? [],
        when: c.when,
        sort: c.sort,
        summary: c.sum,
        body: c.body,
        keys: c.keys,
        facts: c.facts.map((f, i) => parseFact(c.id, i, f)),
        clues: c.clues ?? [],
        confusers: c.cf ?? [],
        tier: c.tier,
        status: c.status ?? 'ai_draft',
        refs: sourceRefs(c.q ?? c.name),
        order: orderCounter++,
        umbrella: !!c.umb,
      });
    }
    return { id: l.id, unitId: input.id, title: l.title, conceptIds: ids, order: li };
  });
  return {
    unit: {
      id: input.id,
      no: input.no,
      title: input.title,
      subtitle: input.subtitle,
      era: input.era,
      color: input.color,
      lessons,
    },
    concepts,
  };
}
