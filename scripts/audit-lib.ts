// 문제 재료 점검(스크립트와 테스트가 함께 사용).
//  - 위험 조합: 다른 개념의 사실 f가 개념 c에도 해당할 수 있음
//    (f 문장에 c의 이름이 있거나, f의 핵심어와 나머지 내용어 절반 이상이 c의 사실·설명문 한 문장에 함께 나옴)
//    → 오답 선택지(c의 거짓 설명)나 ‘누구’ 문제의 오답 후보(c)로 쓰면 실제로는 맞는 답일 수 있다.
//  - 이름 노출: 사실 문장·직접 쓴 자료에 정답 이름이 그대로 있음
//  - 빈칸: 핵심어가 문장에 없거나 두 번 이상 나옴
import { CONCEPTS } from '../src/content';
import { ALSO_TRUE, CHECKED_FALSE } from '../src/content/overlaps';
import type { Concept, Fact } from '../src/content/types';
import { leaksName, namesConcept } from '../src/engine/questions';

const strip = (s: string) => s.replace(/[『』「」\s·]/g, '');
const ENDINGS = ['으로부터', '에서는', '으로써', '이었다', '하였다', '되었다', '시켰다', '에서', '에게', '으로', '로써', '까지', '부터', '하고', '하여', '하는', '이라', '라는', '이다', '였다', '했다', '을', '를', '이', '가', '은', '는', '에', '의', '와', '과', '도', '로', '만'];
const STOP = new Set(['때', '등', '것', '수', '이후', '처음', '최초', '함께', '위해', '통해', '대한', '관련', '중심', '새로운', '여러']);

/** 사실 문장의 내용어(조사·어미를 대강 떼고, 서술어는 뺌) */
export function words(text: string): string[] {
  const out: string[] = [];
  for (let t of text.replace(/[『』「」“”‘’(),.·]/g, ' ').split(/\s+/)) {
    if (!t || /다$/.test(t)) continue;
    for (const e of ENDINGS) {
      if (t.length > e.length + 1 && t.endsWith(e)) {
        t = t.slice(0, -e.length);
        break;
      }
    }
    if (t.length >= 2 && !STOP.has(t)) out.push(t);
  }
  return [...new Set(out)];
}

const sentencesOf = (c: Concept) =>
  [...c.facts.map((f) => f.text), ...c.body.flatMap((p) => p.split(/(?<=[다요]\.)\s+/)), c.summary].map(strip);

/** 사실 f가 개념 c의 사실·설명문 한 문장과 겹치면 겹친 낱말, 아니면 null */
export function overlap(f: Fact, c: Concept): string | null {
  const b = strip(f.blank ?? '');
  const ws = words(f.text).filter((w) => !(b && (b.includes(strip(w)) || strip(w).includes(b))));
  for (const s of sentencesOf(c)) {
    if (b.length >= 2 && !s.includes(b)) continue;
    const got = ws.filter((w) => s.includes(strip(w)));
    const ratio = ws.length ? got.length / ws.length : b ? 1 : 0;
    if ((b.length >= 2 && ratio >= 0.5) || (!b && ws.length >= 3 && ratio >= 0.75)) return got.join('·') || f.blank || '';
  }
  return null;
}

export interface RiskPair {
  /** ‘사실 ID>개념 ID’ */
  id: string;
  fact: Fact;
  owner: Concept;
  target: Concept;
  why: 'name' | 'overlap';
  detail: string;
  /** 처리: 예외 목록(ALSO_TRUE)·이름 규칙으로 막음 / 사람이 ‘분명히 틀림’으로 확인 / 미검토 */
  handled: 'also-true' | 'name' | 'checked-false' | 'unreviewed';
}

const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));

/** 오답 재료로 같이 쓰일 수 있는(같은 종류·다른 이름·같은 키 없음) 모든 사실-개념 조합을 점검 */
export function riskPairs(): RiskPair[] {
  const checked = new Set(CHECKED_FALSE);
  const out: RiskPair[] = [];
  for (const target of CONCEPTS) {
    const ks = new Set(target.facts.map((f) => f.key));
    for (const owner of CONCEPTS) {
      if (owner.id === target.id || owner.kind !== target.kind || owner.name === target.name) continue;
      for (const fact of owner.facts) {
        if (fact.generic || ks.has(fact.key)) continue;
        const named = namesConcept(fact.text, target);
        const ov = overlap(fact, target);
        if (!named && ov === null) continue;
        const id = `${fact.id}>${target.id}`;
        const handled = ALSO_TRUE[fact.id]?.includes(target.id)
          ? 'also-true'
          : named
            ? 'name'
            : checked.has(id)
              ? 'checked-false'
              : 'unreviewed';
        out.push({ id, fact, owner, target, why: named ? 'name' : 'overlap', detail: named ? '이름' : `${fact.blank || '-'} + ${ov}`, handled });
      }
    }
  }
  return out;
}

/** 예외 목록이 현재 콘텐츠의 사실·개념을 가리키는지 */
export function staleExceptions(): string[] {
  const bad: string[] = [];
  const facts = new Map(CONCEPTS.flatMap((c) => c.facts.map((f) => [f.id, f] as const)));
  for (const [fid, cids] of Object.entries(ALSO_TRUE)) {
    if (!facts.has(fid)) bad.push(`ALSO_TRUE 없는 사실 ${fid}`);
    for (const cid of cids) if (!CONCEPT_BY_ID.has(cid)) bad.push(`ALSO_TRUE 없는 개념 ${cid}`);
  }
  const live = new Set(riskPairs().map((p) => p.id));
  for (const id of CHECKED_FALSE) if (!live.has(id)) bad.push(`CHECKED_FALSE 점검에 더 이상 걸리지 않음 ${id}`);
  return bad;
}

const leak = (text: string, c: Concept) => leaksName({ text } as Fact, c);

/** 이름 노출: 사실 문장(‘누구’·자료형 문제에서는 엔진이 건너뜀)과 직접 쓴 자료(건너뛰지 않음 → 고쳐야 함) */
export function nameLeaks(): { facts: string[]; clues: string[] } {
  const facts: string[] = [];
  const clues: string[] = [];
  for (const c of CONCEPTS) {
    for (const f of c.facts) if (leak(f.text, c)) facts.push(`${f.id}(${c.name}) “${f.text}”`);
    if (c.umbrella) continue;
    for (const cl of c.clues) {
      const t = cl.replace(/\{f:[\d,]+\}\s*$/, '');
      if (leak(t, c) || c.aliases.some((a) => strip(a).length >= 2 && strip(t).includes(strip(a)))) clues.push(`${c.id}(${c.name}) “${cl}”`);
    }
  }
  return { facts, clues };
}

/** 빈칸 핵심어가 문장에 없거나 두 번 이상(엔진은 모두 가림) */
export function blankIssues(): { missing: string[]; repeated: string[] } {
  const missing: string[] = [];
  const repeated: string[] = [];
  for (const c of CONCEPTS)
    for (const f of c.facts) {
      if (!f.blank) continue;
      const n = f.text.split(f.blank).length - 1;
      if (n === 0) missing.push(f.id);
      if (n > 1) repeated.push(`${f.id} “${f.text}”`);
    }
  return { missing, repeated };
}
