// 문제 생성기: 하나의 개념(사실 목록)에서 여러 형태의 문제를 만든다.
// 원칙
//  - 오답 선택지는 다른 개념의 '구별되는(generic 아닌)' 사실만 사용하고, 대상 개념과 같은 키의 사실은 제외한다.
//  - 정답 위치는 Balancer로 고르게 분산한다.
//  - 순서 문제는 sort 값으로 정답을 판정하므로 보기 순서를 섞어도 오류가 없다.
import { CONCEPTS, CONCEPT_MAP, ERA_LABEL, ERA_ORDER, FACT_MAP } from '../content';
import { IMAGES, creditOf, imagesOf, kindOf } from '../content/images';
import { ALSO_TRUE } from '../content/overlaps';
import type { Concept, Fact } from '../content/types';
import { josa, shuffle, type Rng, defaultRng } from './util';

export type QKind =
  | 'ox'
  | 'mc_who'
  | 'mc_fact'
  | 'cloze'
  | 'short'
  | 'match'
  | 'sort2'
  | 'order'
  | 'order5'
  | 'clue5'
  | 'wrong5'
  | 'era'
  | 'year'
  | 'photo';

export type KindTier = 'easy' | 'recall' | 'exam';

export const KIND_LABEL: Record<QKind, string> = {
  ox: 'OX 퀴즈',
  mc_who: '알맞은 것 고르기',
  mc_fact: '설명 고르기',
  cloze: '빈칸 채우기',
  short: '주관식 단답',
  match: '짝 맞추기',
  sort2: '비교하기',
  order: '순서 배열',
  order5: '사건 순서',
  clue5: '기출 유형',
  wrong5: '틀린 설명 찾기',
  era: '시대 구분',
  year: '연도 맞히기',
  photo: '사진 자료',
};

export const KIND_TIER: Record<QKind, KindTier> = {
  ox: 'easy',
  mc_who: 'easy',
  mc_fact: 'easy',
  era: 'easy',
  cloze: 'recall',
  short: 'recall',
  match: 'recall',
  sort2: 'recall',
  order: 'recall',
  year: 'recall',
  photo: 'easy',
  clue5: 'exam',
  wrong5: 'exam',
  order5: 'exam',
};

/** 예상 소요 시간(초) — 세션 분량 계산용 */
export const KIND_SECONDS: Record<QKind, number> = {
  ox: 12,
  mc_who: 15,
  mc_fact: 20,
  era: 15,
  cloze: 20,
  short: 25,
  match: 40,
  sort2: 40,
  order: 35,
  year: 18,
  photo: 20,
  clue5: 60,
  wrong5: 60,
  order5: 55,
};

export interface Choice {
  id: string;
  text: string;
  correct: boolean;
  conceptId?: string;
  note?: string;
}

export interface QuestionImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  credit: string;
  sourceUrl: string;
}

export interface Question {
  id: string;
  kind: QKind;
  image?: QuestionImage;
  conceptId: string;
  relatedIds: string[];
  prompt: string;
  chip?: string;
  passageTitle?: string;
  passage?: string[];
  choices?: Choice[];
  numbered?: boolean;
  answer?: string;
  accept?: string[];
  pairs?: { leftId: string; left: string; rightId: string; right: string }[];
  sortItems?: { id: string; text: string; group: 'A' | 'B'; conceptId: string }[];
  groups?: { A: string; B: string };
  orderItems?: { id: string; text: string; label?: string; when?: string }[];
  correctOrder?: string[];
  explanation: string;
  difficulty: 1 | 2 | 3;
}

// ── 정답 위치 분산 ───────────────────────────────────────
export class Balancer {
  private counts = new Map<number, number[]>();
  constructor(private rng: Rng = defaultRng) {}
  next(n: number): number {
    if (!this.counts.has(n)) this.counts.set(n, new Array(n).fill(0));
    const c = this.counts.get(n)!;
    const min = Math.min(...c);
    const cands = c.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0);
    const idx = cands[Math.floor(this.rng() * cands.length)];
    c[idx]++;
    return idx;
  }
  snapshot(n: number) {
    return (this.counts.get(n) ?? []).slice();
  }
}

export interface GenCtx {
  rng: Rng;
  balancer: Balancer;
  /** 이미 학습한 개념(오답 선택지 우선 후보) */
  known?: Set<string>;
}

let qSeq = 0;
const qid = (k: string) => `q${Date.now().toString(36)}${(qSeq++).toString(36)}${k}`;

function place(correct: Choice, wrongs: Choice[], ctx: GenCtx): Choice[] {
  const others = shuffle(wrongs, ctx.rng);
  const pos = ctx.balancer.next(others.length + 1);
  others.splice(pos, 0, correct);
  return others;
}

const specific = (c: Concept) => c.facts.filter((f) => !f.generic);
const keySet = (c: Concept) => new Set(c.facts.map((f) => f.key));

const softText = (s: string) => ` ${s.replace(/[『』「」·]/g, '').replace(/\s+/g, ' ')}`;
const tight = (s: string) => s.replace(/[『』「」\s·]/g, '');
/** 문장에 개념의 이름·별칭이 낱말 첫머리로 나오는지(‘왕오천축국전’ 속 ‘고왕’ 같은 우연 일치는 제외) */
export function namesConcept(text: string, c: Concept): boolean {
  const t = softText(text);
  return [c.name.replace(/\(.*?\)/g, '').trim(), ...c.aliases]
    .filter((n) => tight(n).length >= 2)
    .some((n) => {
      const k = softText(n).trim();
      return [' ', '(', '“', '‘'].some((p) => t.includes(p + k));
    });
}
/** 사실 f가 개념 c에도 맞을 수 있음(사람이 판단한 예외 목록, 또는 문장에 c의 이름이 들어 있음) */
export function alsoFits(f: Fact, c: Concept): boolean {
  return (ALSO_TRUE[f.id]?.includes(c.id) ?? false) || namesConcept(f.text, c);
}
/** 개념 이름과 그 구성 부분(‘보안회와 대한 자강회’ → 보안회, 대한 자강회) */
const nameParts = (c: Concept) => {
  const base = c.name.replace(/\(.*?\)/g, '').trim();
  return [base, ...base.split(/(?:와|과|및) /)].map(tight).filter((n) => n.length >= 2);
};
/** 자료·발문에 정답 이름이 드러나는 사실(예: 인조 — ‘인조반정으로 즉위하였다’) */
export const leaksName = (f: Fact, c: Concept) => nameParts(c).some((n) => tight(f.text).includes(n));

/** 비슷한 개념 후보: 혼동 개념 → 같은 단원·같은 종류 → 같은 시대·같은 종류 → 같은 종류 */
export function similarConcepts(c: Concept, ctx: GenCtx, opts: { sameNoun?: boolean; need?: (x: Concept) => boolean } = {}): Concept[] {
  const ok = (x: Concept) =>
    x.id !== c.id && x.kind === c.kind && x.name !== c.name && (!opts.sameNoun || x.noun === c.noun) && (!opts.need || opts.need(x));
  const seen = new Set<string>();
  const out: Concept[] = [];
  const push = (list: Concept[]) => {
    for (const x of shuffle(list, ctx.rng)) {
      if (!seen.has(x.id) && ok(x)) {
        seen.add(x.id);
        out.push(x);
      }
    }
  };
  push(c.confusers.map((id) => CONCEPT_MAP.get(id)!).filter(Boolean));
  // 대상이 다른 개념의 혼동 목록에 있는 경우도 포함
  push(CONCEPTS.filter((x) => x.confusers.includes(c.id)));
  const known = ctx.known;
  const sameUnit = CONCEPTS.filter((x) => x.unitId === c.unitId);
  push(known ? sameUnit.filter((x) => known.has(x.id)) : sameUnit);
  push(sameUnit);
  push(CONCEPTS.filter((x) => x.era === c.era));
  push(CONCEPTS);
  return out;
}

/** 대상 개념에 대해 '거짓'이 확실한 다른 개념의 사실 */
export function falseFactsFor(c: Concept, ctx: GenCtx, n: number, exclude: Set<string> = new Set()): Fact[] {
  const ks = keySet(c);
  const used = new Set<string>(exclude);
  const out: Fact[] = [];
  // 같은 명사(왕·단체·사건 등)의 개념을 먼저, 부족하면 같은 종류에서
  const sameNoun = similarConcepts(c, ctx, { sameNoun: true });
  const rest = similarConcepts(c, ctx).filter((x) => !sameNoun.includes(x));
  for (const other of [...sameNoun, ...rest]) {
    const okFacts = shuffle(specific(other), ctx.rng).filter((f) => !ks.has(f.key) && !used.has(f.key) && !alsoFits(f, c));
    if (okFacts.length) {
      out.push(okFacts[0]);
      used.add(okFacts[0].key);
    }
    if (out.length >= n) break;
  }
  return out;
}

const factNote = (f: Fact) => {
  const c = CONCEPT_MAP.get(f.conceptId)!;
  return `→ ${c.name}`;
};

function baseExplanation(c: Concept): string {
  return `${c.name}${c.when ? ` (${c.when})` : ''}: ${c.summary}`;
}

// ── 개별 생성기 ──────────────────────────────────────────

export function genOX(c: Concept, ctx: GenCtx, wantTrue?: boolean): Question | null {
  const truth = wantTrue ?? ctx.rng() < 0.5;
  if (truth) {
    const f = shuffle(c.facts, ctx.rng)[0];
    if (!f) return null;
    return {
      id: qid('ox'),
      kind: 'ox',
      conceptId: c.id,
      relatedIds: [],
      prompt: '다음 설명이 맞으면 O, 틀리면 X를 고르세요.',
      chip: c.name,
      passage: [f.text],
      choices: [
        { id: 'O', text: 'O', correct: true },
        { id: 'X', text: 'X', correct: false },
      ],
      explanation: `맞는 설명입니다. ${baseExplanation(c)}`,
      difficulty: 1,
    };
  }
  const [ff] = falseFactsFor(c, ctx, 1);
  if (!ff) return genOX(c, ctx, true);
  const other = CONCEPT_MAP.get(ff.conceptId)!;
  return {
    id: qid('ox'),
    kind: 'ox',
    conceptId: c.id,
    relatedIds: [other.id],
    prompt: '다음 설명이 맞으면 O, 틀리면 X를 고르세요.',
    chip: c.name,
    passage: [ff.text],
    choices: [
      { id: 'O', text: 'O', correct: false, conceptId: other.id },
      { id: 'X', text: 'X', correct: true },
    ],
    explanation: `틀린 설명입니다. 이 설명은 ${other.name}에 해당합니다. ${baseExplanation(c)}`,
    difficulty: 1,
  };
}

/** 사실 → 누구(무엇)인가? */
export function genWho(c: Concept, ctx: GenCtx, n = 3): Question | null {
  // 정답 이름이 드러나는 사실은 쓰지 않는다
  const f = shuffle(specific(c), ctx.rng).find((x) => !leaksName(x, c)) ?? c.facts.find((x) => !leaksName(x, c));
  if (!f) return null;
  const fitsToo = (x: Concept) => x.facts.some((xf) => xf.key === f.key) || alsoFits(f, x);
  const others = similarConcepts(c, ctx, {
    sameNoun: true,
    need: (x) => !fitsToo(x),
  }).slice(0, n - 1);
  const more =
    others.length < n - 1
      ? similarConcepts(c, ctx, { need: (x) => !fitsToo(x) && !others.includes(x) }).slice(0, n - 1 - others.length)
      : [];
  const ds = [...others, ...more];
  if (ds.length < 1) return null;
  const choices = place(
    { id: c.id, text: c.name, correct: true, conceptId: c.id },
    ds.map((d) => ({ id: d.id, text: d.name, correct: false, conceptId: d.id, note: d.summary })),
    ctx,
  );
  return {
    id: qid('who'),
    kind: 'mc_who',
    conceptId: c.id,
    relatedIds: ds.map((d) => d.id),
    prompt: `다음 설명에 해당하는 ${josa(c.noun, '은/는')}?`,
    passage: [f.text],
    choices,
    numbered: n === 5,
    explanation: baseExplanation(c),
    difficulty: n >= 5 ? 2 : 1,
  };
}

/** 이 개념에 대한 설명으로 옳은 것은? (쉬운 3지선다) */
export function genFact(c: Concept, ctx: GenCtx, n = 3): Question | null {
  // 정답 선택지에 대상 이름이 그대로 있으면 너무 쉬우므로, 가능하면 이름이 없는 사실을 정답으로
  const cands = shuffle(specific(c), ctx.rng).sort((a, b) => Number(leaksName(a, c)) - Number(leaksName(b, c)));
  const right = cands[0] ?? shuffle(c.facts, ctx.rng)[0];
  if (!right) return null;
  const wrong = falseFactsFor(c, ctx, n - 1);
  if (wrong.length < n - 1) return null;
  const choices = place(
    { id: right.id, text: right.text, correct: true, conceptId: c.id },
    wrong.map((f) => ({ id: f.id, text: f.text, correct: false, conceptId: f.conceptId, note: factNote(f) })),
    ctx,
  );
  return {
    id: qid('fact'),
    kind: 'mc_fact',
    conceptId: c.id,
    relatedIds: wrong.map((f) => f.conceptId),
    prompt: `${c.name}에 대한 설명으로 옳은 것은?`,
    choices,
    explanation: baseExplanation(c),
    difficulty: 1,
  };
}

/** 빈칸 채우기 (선택형 또는 주관식) */
export function genCloze(c: Concept, ctx: GenCtx, typed = false): Question | null {
  const cand = shuffle(
    c.facts.filter((f) => f.blank),
    ctx.rng,
  );
  const f = cand[0];
  if (!f || !f.blank) return null;
  // 같은 말이 두 번 나오면 모두 가린다(예: ‘교장도감을 두어 교장을 편찬’)
  const blankText = f.text.split(f.blank).join('（　？　）');
  if (typed) {
    const accept = [f.blank, f.blank.replace(/[『』「」]/g, '')];
    return {
      id: qid('short'),
      kind: 'short',
      conceptId: c.id,
      relatedIds: [],
      prompt: '빈칸에 들어갈 말을 입력하세요.',
      chip: c.name,
      passage: [blankText],
      answer: f.blank,
      accept,
      explanation: `정답: ${f.blank}. ${baseExplanation(c)}`,
      difficulty: 2,
    };
  }
  // 오답: 비슷한 개념의 빈칸어
  const pool: string[] = [];
  const own = c.facts.map((x) => x.blank).filter(Boolean) as string[];
  // 한쪽이 다른 쪽을 품는 말(사비/사비성, 향약/예안 향약)은 사실상 같은 답이라 오답으로 쓰지 않는다
  const nested = (a: string, b: string) => tight(a).includes(tight(b)) || tight(b).includes(tight(a));
  for (const o of similarConcepts(c, ctx)) {
    for (const of of shuffle(o.facts, ctx.rng)) {
      if (of.blank && !own.some((x) => nested(x, of.blank!)) && !pool.some((x) => nested(x, of.blank!))) {
        pool.push(of.blank);
        break;
      }
    }
    if (pool.length >= 3) break;
  }
  if (pool.length < 2) return null;
  const choices = place(
    { id: 'ans', text: f.blank, correct: true, conceptId: c.id },
    pool.slice(0, 3).map((t, i) => ({ id: `w${i}`, text: t, correct: false })),
    ctx,
  );
  return {
    id: qid('cloze'),
    kind: 'cloze',
    conceptId: c.id,
    relatedIds: [],
    prompt: '빈칸에 들어갈 말로 알맞은 것은?',
    chip: c.name,
    passage: [blankText],
    choices,
    explanation: `정답: ${f.blank}. ${baseExplanation(c)}`,
    difficulty: 1,
  };
}

/** 짝 맞추기(인물·사건 ↔ 업적·내용) */
export function genMatch(c: Concept, ctx: GenCtx, size = 3): Question | null {
  const group: Concept[] = [c];
  for (const o of similarConcepts(c, ctx)) {
    if (group.length >= size) break;
    group.push(o);
  }
  if (group.length < 3) return null;
  const usedKeys = new Set<string>();
  const allKeys = group.map((g) => keySet(g));
  const pairs: NonNullable<Question['pairs']> = [];
  for (let gi = 0; gi < group.length; gi++) {
    const g = group[gi];
    const f = shuffle(specific(g), ctx.rng).find(
      (x) =>
        !usedKeys.has(x.key) &&
        allKeys.every((ks, i) => i === gi || !ks.has(x.key)) &&
        group.every((o, i) => i === gi || !alsoFits(x, o)),
    );
    if (!f) return null;
    usedKeys.add(f.key);
    pairs.push({ leftId: g.id, left: g.name, rightId: f.id, right: f.text });
  }
  return {
    id: qid('match'),
    kind: 'match',
    conceptId: c.id,
    relatedIds: group.slice(1).map((g) => g.id),
    prompt: '서로 관련 있는 것끼리 연결하세요.',
    pairs,
    explanation: pairs.map((p) => `${p.left} — ${p.right}`).join('\n'),
    difficulty: 2,
  };
}

/** 두 개념 비교: 각 설명이 A, B 중 어디에 해당하는지 분류 */
export function genSort2(c: Concept, ctx: GenCtx, otherId?: string): Question | null {
  const other = otherId ? CONCEPT_MAP.get(otherId) : similarConcepts(c, ctx)[0];
  if (!other) return null;
  const ka = keySet(c);
  const kb = keySet(other);
  const fa = shuffle(specific(c), ctx.rng).filter((f) => !kb.has(f.key) && !alsoFits(f, other)).slice(0, 2);
  const fb = shuffle(specific(other), ctx.rng).filter((f) => !ka.has(f.key) && !alsoFits(f, c)).slice(0, 2);
  if (fa.length + fb.length < 3 || !fa.length || !fb.length) return null;
  const items = shuffle(
    [
      ...fa.map((f) => ({ id: f.id, text: f.text, group: 'A' as const, conceptId: c.id })),
      ...fb.map((f) => ({ id: f.id, text: f.text, group: 'B' as const, conceptId: other.id })),
    ],
    ctx.rng,
  );
  return {
    id: qid('sort'),
    kind: 'sort2',
    conceptId: c.id,
    relatedIds: [other.id],
    // 이름 자체에 ‘~와 ~’가 들어간 개념이 있어 따옴표로 묶는다
    prompt: `각 설명이 ‘${c.name}’, ‘${other.name}’ 중 어디에 해당하는지 고르세요.`,
    groups: { A: c.name, B: other.name },
    sortItems: items,
    explanation: `${baseExplanation(c)}\n${baseExplanation(other)}`,
    difficulty: 2,
  };
}

function orderable(c: Concept) {
  return typeof c.sort === 'number' && (c.kind === 'event' || c.kind === 'person' || c.kind === 'group' || c.kind === 'policy' || c.kind === 'institution');
}

/**
 * 개념의 시기 범위(연도). ‘1176~1198’, ‘1920년대’, ‘14세기 후반’처럼 기간인 개념끼리는 겹치면 순서를 정할 수 없다.
 * 끝이 열린 표기(‘976~’, ‘?~846’)와 단일 시점은 sort 값 한 점으로 본다.
 */
export function spanOf(c: Concept): [number, number] {
  const s = c.sort as number;
  const w = c.when ?? '';
  const nums = (w.match(/\d{2,4}/g) ?? []).map(Number).map((y) => (/기원전/.test(w) ? -y : y));
  let lo = s;
  let hi = s;
  const century = w.match(/(\d{1,2})세기/);
  if (/년대/.test(w) && nums.length) {
    // ‘1920년대’ → 1920~1929, ‘1930년대 후반~1945’ → 1930~1945
    lo = Math.min(...nums);
    hi = Math.max(...nums);
    if (w.includes(`${hi}년대`)) hi += 9;
  } else if (century) {
    const base = (Number(century[1]) - 1) * 100;
    lo = base + (/후반/.test(w) ? 50 : 0);
    hi = base + (/전반/.test(w) ? 49 : 99);
  } else if (/\d\s*~\s*\d/.test(w) && nums.length >= 2) {
    lo = Math.min(...nums);
    hi = Math.max(...nums);
  }
  return [Math.min(lo, s), Math.max(hi, s)];
}
const apart = (a: Concept, b: Concept) => {
  if (Math.abs((a.sort as number) - (b.sort as number)) < 0.02) return false;
  const [al, ah] = spanOf(a);
  const [bl, bh] = spanOf(b);
  return ah < bl || bh < al;
};

/** 연대순 후보 고르기: sort 값이 0.02 이상 떨어지고 시기 범위가 겹치지 않는 것끼리 */
function pickChrono(c: Concept, ctx: GenCtx, n: number, wide = false): Concept[] | null {
  if (!orderable(c)) return null;
  const pool = CONCEPTS.filter(
    (x) => x.id !== c.id && orderable(x) && (wide ? x.era === c.era || x.unitId === c.unitId : x.unitId === c.unitId),
  );
  const chosen = [c];
  const prefer = shuffle(
    pool.filter((x) => x.kind === c.kind),
    ctx.rng,
  ).concat(shuffle(pool, ctx.rng));
  for (const x of prefer) {
    if (chosen.length >= n) break;
    if (chosen.includes(x)) continue;
    if (chosen.every((y) => apart(x, y))) chosen.push(x);
  }
  return chosen.length >= n ? chosen : null;
}

/** 순서 배열(탭해서 순서대로 나열) */
export function genOrder(c: Concept, ctx: GenCtx, n = 3): Question | null {
  const items = pickChrono(c, ctx, n) ?? pickChrono(c, ctx, n, true);
  if (!items) return null;
  const sorted = items.slice().sort((a, b) => (a.sort as number) - (b.sort as number));
  return {
    id: qid('order'),
    kind: 'order',
    conceptId: c.id,
    relatedIds: items.filter((x) => x.id !== c.id).map((x) => x.id),
    prompt: '일어난(활동한) 순서대로 차례로 누르세요.',
    orderItems: shuffle(
      items.map((x) => ({ id: x.id, text: x.name, when: x.when })),
      ctx.rng,
    ),
    correctOrder: sorted.map((x) => x.id),
    explanation: sorted.map((x) => `${x.name}${x.when ? ` (${x.when})` : ''}`).join(' → '),
    difficulty: 2,
  };
}

const LABELS = ['(가)', '(나)', '(다)', '(라)'];
/** 기출형 순서 5지선다: (가)~(라)를 순서대로 나열한 것은? */
export function genOrder5(c: Concept, ctx: GenCtx): Question | null {
  const items = pickChrono(c, ctx, 4) ?? pickChrono(c, ctx, 4, true);
  if (!items) return null;
  const shown = shuffle(items, ctx.rng);
  const labelOf = new Map(shown.map((x, i) => [x.id, LABELS[i]]));
  const correctSeq = shown
    .slice()
    .sort((a, b) => (a.sort as number) - (b.sort as number))
    .map((x) => labelOf.get(x.id)!);
  const key = (seq: string[]) => seq.join(' - ');
  const correctKey = key(correctSeq);
  const wrongSeqs = new Set<string>();
  let guard = 0;
  while (wrongSeqs.size < 4 && guard++ < 200) {
    const s = key(shuffle(correctSeq, ctx.rng));
    if (s !== correctKey) wrongSeqs.add(s);
  }
  const choices = place(
    { id: 'ans', text: correctKey, correct: true },
    [...wrongSeqs].map((t, i) => ({ id: `w${i}`, text: t, correct: false })),
    ctx,
  );
  const describe = (x: Concept) => {
    const f = specific(x)[0] ?? x.facts[0];
    return `${x.name} — ${f ? f.text : x.summary}`;
  };
  return {
    id: qid('ord5'),
    kind: 'order5',
    conceptId: c.id,
    relatedIds: items.filter((x) => x.id !== c.id).map((x) => x.id),
    prompt: '(가)~(라)를 일어난 순서대로 옳게 나열한 것은?',
    passage: shown.map((x, i) => `${LABELS[i]} ${describe(x)}`),
    choices,
    numbered: true,
    explanation: shown
      .slice()
      .sort((a, b) => (a.sort as number) - (b.sort as number))
      .map((x) => `${labelOf.get(x.id)} ${x.name}${x.when ? `(${x.when})` : ''}`)
      .join(' → '),
    difficulty: 3,
  };
}

/** 자료(단서) → 대상 파악 → 옳은 설명 고르기 (기출 유형 5지선다) */
export function genClue5(c: Concept, ctx: GenCtx): Question | null {
  if (c.umbrella) return null;
  // 자료 만들기: 직접 작성한 자료가 있으면 우선 사용
  let passage: string[] = [];
  const revealed = new Set<string>();
  const custom = shuffle(c.clues, ctx.rng)[0];
  if (custom && ctx.rng() < 0.7) {
    const m = custom.match(/\{f:([\d,]+)\}\s*$/);
    const text = custom.replace(/\{f:[\d,]+\}\s*$/, '').trim();
    passage = [text];
    if (m) m[1].split(',').forEach((i) => c.facts[Number(i)] && revealed.add(c.facts[Number(i)].key));
    for (const f of c.facts) if (f.blank && text.includes(f.blank)) revealed.add(f.key);
  } else {
    // 자료는 대상을 하나로 좁혀야 하므로 일반적 서술·다른 개념에도 맞는 사실·이름이 드러나는 사실은 쓰지 않는다
    const clueFacts = shuffle(
      c.facts.filter((f) => !f.generic && !ALSO_TRUE[f.id] && !leaksName(f, c)),
      ctx.rng,
    ).slice(0, c.facts.length >= 4 ? 2 : 1);
    if (!clueFacts.length) return null;
    if (c.facts.length < 2) return null;
    passage = clueFacts.map((f) => `• ${f.text}`);
    clueFacts.forEach((f) => revealed.add(f.key));
  }
  // 자료는 이름을 (가)로 가렸으므로 정답 선택지에도 이름이 드러나지 않게
  const rightCands = shuffle(
    c.facts.filter((f) => !revealed.has(f.key) && !leaksName(f, c)),
    ctx.rng,
  ).sort((a, b) => Number(a.generic) - Number(b.generic));
  const right = rightCands[0];
  if (!right) return null;
  const wrong = falseFactsFor(c, ctx, 4, revealed);
  if (wrong.length < 4) return null;
  const choices = place(
    { id: right.id, text: right.text, correct: true, conceptId: c.id },
    wrong.map((f) => ({ id: f.id, text: f.text, correct: false, conceptId: f.conceptId, note: factNote(f) })),
    ctx,
  );
  return {
    id: qid('clue'),
    kind: 'clue5',
    conceptId: c.id,
    relatedIds: wrong.map((f) => f.conceptId),
    prompt: `다음 자료에 해당하는 ${c.noun}에 대한 설명으로 옳은 것은?`,
    passageTitle: `(가) ${c.noun}`,
    passage,
    choices,
    numbered: true,
    explanation: `(가)는 ${c.name}입니다. ${c.summary}`,
    difficulty: 3,
  };
}

/** 옳지 않은 것은? (틀린 설명 찾기) */
export function genWrong5(c: Concept, ctx: GenCtx): Question | null {
  const trues = shuffle(c.facts, ctx.rng).slice(0, 4);
  if (trues.length < 4) return null;
  const [bad] = falseFactsFor(c, ctx, 1);
  if (!bad) return null;
  const choices = place(
    { id: bad.id, text: bad.text, correct: true, conceptId: bad.conceptId, note: factNote(bad) },
    trues.map((f) => ({ id: f.id, text: f.text, correct: false, conceptId: c.id })),
    ctx,
  );
  const other = CONCEPT_MAP.get(bad.conceptId)!;
  return {
    id: qid('wrong'),
    kind: 'wrong5',
    conceptId: c.id,
    relatedIds: [other.id],
    prompt: `${c.name}에 대한 설명으로 옳지 않은 것은?`,
    choices,
    numbered: true,
    explanation: `‘${bad.text}’는 ${other.name}에 대한 설명입니다. ${baseExplanation(c)}`,
    difficulty: 3,
  };
}

/** 시대 구분 */
export function genEra(c: Concept, ctx: GenCtx): Question | null {
  if (c.era === 'theme') return null;
  const f = shuffle(specific(c), ctx.rng)[0] ?? c.facts[0];
  const idx = ERA_ORDER.indexOf(c.era);
  const near = ERA_ORDER.filter((e) => e !== c.era).sort(
    (a, b) => Math.abs(ERA_ORDER.indexOf(a) - idx) - Math.abs(ERA_ORDER.indexOf(b) - idx) + (ctx.rng() - 0.5),
  );
  const wrongs = near.slice(0, 3);
  const choices = place(
    { id: c.era, text: ERA_LABEL[c.era], correct: true },
    wrongs.map((e) => ({ id: e, text: ERA_LABEL[e], correct: false })),
    ctx,
  );
  return {
    id: qid('era'),
    kind: 'era',
    conceptId: c.id,
    relatedIds: [],
    prompt: '다음과 관련된 시대는?',
    chip: c.name,
    passage: f ? [f.text] : [c.summary],
    choices,
    explanation: `${josa(c.name, '은/는')} ${ERA_LABEL[c.era]}에 해당합니다. ${c.summary}`,
    difficulty: 1,
  };
}

// ‘1920년대’는 단일 연도가 아니다
const SINGLE_YEAR = /^(\d{3,4})년(?!대)/;
/** 연도 맞히기(단일 연도 사건만) */
export function genYear(c: Concept, ctx: GenCtx): Question | null {
  if (c.kind !== 'event' || !c.when) return null;
  const m = c.when.match(SINGLE_YEAR);
  if (!m || c.when.includes('~')) return null;
  const year = Number(m[1]);
  const pool = shuffle(
    CONCEPTS.filter((x) => x.id !== c.id && x.when && SINGLE_YEAR.test(x.when) && !x.when.includes('~') && (x.unitId === c.unitId || x.era === c.era)),
    ctx.rng,
  );
  const years = new Set<number>();
  for (const x of pool) {
    const y = Number(x.when!.match(SINGLE_YEAR)![1]);
    if (y !== year) years.add(y);
    if (years.size >= 3) break;
  }
  if (years.size < 2) return null;
  const choices = place(
    { id: 'ans', text: `${year}년`, correct: true },
    [...years].slice(0, 3).map((y, i) => ({ id: `w${i}`, text: `${y}년`, correct: false })),
    ctx,
  );
  return {
    id: qid('year'),
    kind: 'year',
    conceptId: c.id,
    relatedIds: [],
    prompt: `${josa(c.name, '이/가')} 일어난 해는?`,
    choices,
    explanation: `${c.name}: ${c.when}. ${c.summary}`,
    difficulty: 2,
  };
}

/**
 * 사진 자료: 문화유산 사진을 보고 이름 / 관련 설명 / 시대를 고른다.
 * 오답 선택지는 다른 사진의 문화유산(이름·설명)이라 '사진 속 유산'만 정답이 된다.
 */
export function genPhoto(c: Concept, ctx: GenCtx): Question | null {
  const mine = imagesOf(c.id);
  if (!mine.length) return null;
  const im = mine[Math.floor(ctx.rng() * mine.length)];
  const kind = kindOf(im);
  const W = PHOTO_WORDS[kind];
  const image: QuestionImage = { src: im.file, alt: W.alt, width: im.width, height: im.height, credit: creditOf(im), sourceUrl: im.sourceUrl };
  // 오답 후보는 같은 종류(문화유산끼리·인물끼리·지도끼리)에서만
  const others = shuffle(IMAGES.filter((x) => x.name !== im.name && kindOf(x) === kind), ctx.rng);
  // 같은 시대의 사진을 먼저 오답 후보로(구별해야 할 대상)
  others.sort((a, b) => Number(CONCEPT_MAP.get(b.conceptId)?.era === c.era) - Number(CONCEPT_MAP.get(a.conceptId)?.era === c.era));
  const fact = im.factId ? FACT_MAP.get(im.factId) : undefined;
  const variants: ('name' | 'fact' | 'era')[] = ['name'];
  if (fact && others.filter((x) => x.factId && x.factId !== im.factId).length >= 3) variants.push('fact');
  if (c.era !== 'theme') variants.push('era');
  const v = variants[Math.floor(ctx.rng() * variants.length)];
  const base = { id: qid('photo'), kind: 'photo' as const, conceptId: c.id, relatedIds: [], image, difficulty: 1 as const };
  const tail = `${im.name}${fact ? ` — ${fact.text}` : ''}. (${c.name}) ${c.summary}`;
  if (v === 'era') {
    const idx = ERA_ORDER.indexOf(c.era);
    const near = ERA_ORDER.filter((e) => e !== c.era).sort((a, b) => Math.abs(ERA_ORDER.indexOf(a) - idx) - Math.abs(ERA_ORDER.indexOf(b) - idx) + (ctx.rng() - 0.5));
    const choices = place({ id: c.era, text: ERA_LABEL[c.era], correct: true }, near.slice(0, 3).map((e) => ({ id: e, text: ERA_LABEL[e], correct: false })), ctx);
    return { ...base, prompt: W.era, choices, explanation: `${ERA_LABEL[c.era]}: ${tail}` };
  }
  if (v === 'fact') {
    const seenFacts = new Set<string>();
    const wrongs = others
      .filter((x) => x.factId && x.factId !== im.factId && !seenFacts.has(x.factId) && seenFacts.add(x.factId))
      .slice(0, 3)
      .map((x, i) => ({ id: `w${i}`, text: FACT_MAP.get(x.factId!)!.text, correct: false, conceptId: x.conceptId !== c.id ? x.conceptId : undefined }));
    const choices = place({ id: 'ans', text: fact!.text, correct: true, conceptId: c.id }, wrongs, ctx);
    return { ...base, prompt: W.fact, choices, explanation: tail };
  }
  const names = others.slice(0, 3);
  if (names.length < 3) return null;
  const choices = place(
    { id: 'ans', text: im.name, correct: true, conceptId: c.id },
    names.map((x, i) => ({ id: `w${i}`, text: x.name, correct: false, conceptId: x.conceptId !== c.id ? x.conceptId : undefined })),
    ctx,
  );
  return { ...base, prompt: W.name, choices, explanation: tail };
}

const PHOTO_WORDS = {
  heritage: { alt: '문화유산 사진', name: '사진 속 문화유산은?', fact: '사진 속 문화유산에 대한 설명으로 옳은 것은?', era: '사진 속 문화유산과 관련된 시대는?' },
  person: { alt: '인물 초상·사진', name: '사진 속 인물은?', fact: '사진 속 인물에 대한 설명으로 옳은 것은?', era: '사진 속 인물이 활동한 시대는?' },
  map: { alt: '역사 지도', name: '지도에 나타난 상황은?', fact: '지도와 관련된 설명으로 옳은 것은?', era: '지도와 관련된 시대는?' },
} as const;

const GENERATORS: Record<QKind, (c: Concept, ctx: GenCtx) => Question | null> = {
  ox: (c, x) => genOX(c, x),
  mc_who: (c, x) => genWho(c, x, 3),
  mc_fact: (c, x) => genFact(c, x, 3),
  cloze: (c, x) => genCloze(c, x, false),
  short: (c, x) => genCloze(c, x, true),
  match: (c, x) => genMatch(c, x),
  sort2: (c, x) => genSort2(c, x),
  order: (c, x) => genOrder(c, x),
  order5: (c, x) => genOrder5(c, x),
  clue5: (c, x) => genClue5(c, x),
  wrong5: (c, x) => genWrong5(c, x),
  era: (c, x) => genEra(c, x),
  year: (c, x) => genYear(c, x),
  photo: (c, x) => genPhoto(c, x),
};

/** 원하는 유형을 순서대로 시도하고, 모두 실패하면 OX로 대체 */
export function generate(c: Concept, kinds: QKind[], ctx: GenCtx): Question {
  for (const k of kinds) {
    const q = GENERATORS[k](c, ctx);
    if (q) return q;
  }
  return genOX(c, ctx, true)!;
}

// ── 채점 ─────────────────────────────────────────────────
export type Response =
  | { type: 'choice'; choiceId: string }
  | { type: 'text'; text: string }
  | { type: 'pairs'; map: Record<string, string> } // leftId -> rightId
  | { type: 'sort'; map: Record<string, 'A' | 'B'> }
  | { type: 'order'; ids: string[] };

export const normalizeAnswer = (s: string) => s.replace(/[\s·.,()『』「」'"‘’“”]/g, '').toLowerCase();

export interface Grade {
  correct: boolean;
  /** 사용자가 고른 오답이 가리키는 개념(혼동 분석용) */
  confusedWith?: string;
  userAnswer: string;
  correctAnswer: string;
}

export function grade(q: Question, r: Response): Grade {
  switch (q.kind) {
    case 'short': {
      const text = r.type === 'text' ? r.text : '';
      const ok = (q.accept ?? [q.answer ?? '']).some((a) => normalizeAnswer(a) === normalizeAnswer(text));
      return { correct: ok, userAnswer: text, correctAnswer: q.answer ?? '' };
    }
    case 'match': {
      const map = r.type === 'pairs' ? r.map : {};
      const ok = q.pairs!.every((p) => map[p.leftId] === p.rightId);
      let confusedWith: string | undefined;
      for (const p of q.pairs!) {
        if (map[p.leftId] && map[p.leftId] !== p.rightId) {
          const wrongPair = q.pairs!.find((x) => x.rightId === map[p.leftId]);
          if (wrongPair && p.leftId === q.conceptId) confusedWith = wrongPair.leftId;
          if (wrongPair && wrongPair.leftId === q.conceptId) confusedWith = p.leftId;
        }
      }
      return { correct: ok, confusedWith, userAnswer: '연결 오류', correctAnswer: q.explanation };
    }
    case 'sort2': {
      const map = r.type === 'sort' ? r.map : {};
      const ok = q.sortItems!.every((it) => map[it.id] === it.group);
      return {
        correct: ok,
        confusedWith: ok ? undefined : q.relatedIds[0],
        userAnswer: '분류 오류',
        correctAnswer: q.sortItems!.map((it) => `${it.text} → ${it.group === 'A' ? q.groups!.A : q.groups!.B}`).join('\n'),
      };
    }
    case 'order': {
      const ids = r.type === 'order' ? r.ids : [];
      const ok = ids.length === q.correctOrder!.length && ids.every((id, i) => id === q.correctOrder![i]);
      const nameOf = (id: string) => q.orderItems!.find((x) => x.id === id)?.text ?? id;
      return { correct: ok, userAnswer: ids.map(nameOf).join(' → '), correctAnswer: q.correctOrder!.map(nameOf).join(' → ') };
    }
    default: {
      const id = r.type === 'choice' ? r.choiceId : '';
      const chosen = q.choices!.find((c) => c.id === id);
      const right = q.choices!.find((c) => c.correct)!;
      const ok = !!chosen?.correct;
      let confusedWith: string | undefined;
      if (!ok && chosen?.conceptId && chosen.conceptId !== q.conceptId) confusedWith = chosen.conceptId;
      if (!ok && q.kind === 'wrong5') confusedWith = right.conceptId;
      if (!ok && q.kind === 'ox') confusedWith = q.relatedIds[0];
      return { correct: ok, confusedWith, userAnswer: chosen?.text ?? '', correctAnswer: right.text };
    }
  }
}
