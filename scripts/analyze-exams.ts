// 공식 기출(심화 57~80회) 분석: 정답표 해석 + 문항 분할 + 개념 자동 태깅(키워드 매칭) + 출제 빈도 집계
// 입력: exam-pdfs/text/{회차}-q.txt, {회차}-a.txt (PDF 텍스트/OCR 결과, git 제외)
// 출력: src/content/examAnalysis.json (문항 본문은 저장하지 않음 — 정답·배점·태그·통계만)
//       exam-pdfs/review/{회차}.txt (사람이 검수할 때 보는 요약, git 제외)
// 실행: npx tsx scripts/analyze-exams.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONCEPTS, CONCEPT_MAP, UNITS } from '../src/content';
import type { Concept } from '../src/content/types';

const ROUNDS = Array.from({ length: 24 }, (_, i) => 57 + i);
const TEXT_LAYER = new Set([58, 62, 70, 71, 72, 75, 76, 77, 80]);
const CIRC: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };

// ── 1. 정답표 ───────────────────────────────────────────
export interface KeyItem {
  ans: number[]; // 빈 배열 = 정답 없음(전원 정답 처리)
  pts: number;
}
function parseKey(text: string): KeyItem[] {
  const key: (KeyItem | undefined)[] = Array(50).fill(undefined);
  for (const line of text.split('\n')) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    if (toks.length < 3 || !/^\d{1,2}$/.test(toks[0])) continue;
    for (let i = 0; i + 2 < toks.length + 1; ) {
      const q = Number(toks[i]);
      const a = toks[i + 1];
      const p = Number(toks[i + 2]);
      if (!(q >= 1 && q <= 50) || !(p >= 1 && p <= 3) || a === undefined) {
        i++;
        continue;
      }
      let ans: number[] | null = null;
      if (a === '없음') ans = [];
      else if (/^[①②③④⑤,·]+$/.test(a)) ans = [...a].filter((c) => c in CIRC).map((c) => CIRC[c]);
      else if (/^[1-5]$/.test(a)) ans = [Number(a)];
      if (ans === null) {
        i++;
        continue;
      }
      if (!key[q - 1]) key[q - 1] = { ans, pts: p };
      i += 3;
    }
  }
  if (key.some((k) => !k)) throw new Error('정답표 해석 실패: ' + key.map((k, i) => (k ? '' : i + 1)).filter(Boolean).join(','));
  const items = key as KeyItem[];
  const sum = items.reduce((a, k) => a + k.pts, 0);
  if (sum !== 100) throw new Error(`배점 합계 ${sum}`);
  return items;
}

// ── 2. 문항 분할 ───────────────────────────────────────
const norm = (s: string) => s.replace(/[\s·.,()\[\]{}'"‘’“”「」『』<>〈〉:;!?~\-–—_/\\|]/g, '');
const CHOICE_START = /^[\s]*([①②③④⑤]|[㉠-㉿]|[ⓐ-ⓩ®©◎ⓞ⑥⑦⑧⑨⑩]|[ⓘ])/;

interface QSeg {
  q: number;
  stem: string;
  passage: string[];
  choices: string[];
}
function splitQuestions(text: string): QSeg[] {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/﻿/g, '').trim())
    .filter((l) => l && !/^=== PAGE/.test(l) && !/^\d{1,2}$/.test(l) && !/한국사능력검정시험/.test(l) && !/^심화$|^\d{4}년도$/.test(l));
  // 각 문항 번호의 시작 줄 찾기(차례대로)
  const starts: number[] = [];
  let from = 0;
  for (let n = 1; n <= 50; n++) {
    const re = new RegExp(`^${n}\\s*[.．,]\\s*\\S`);
    let found = -1;
    for (let i = from; i < lines.length; i++) {
      if (re.test(lines[i]) && /점\]|것은|\?|옳|해당|가장|시기|사실/.test(lines[i] + (lines[i + 1] ?? ''))) {
        found = i;
        break;
      }
    }
    starts.push(found);
    if (found >= 0) from = found + 1;
  }
  const segs: QSeg[] = [];
  for (let n = 1; n <= 50; n++) {
    const s = starts[n - 1];
    if (s < 0) {
      segs.push({ q: n, stem: '', passage: [], choices: [] });
      continue;
    }
    let e = lines.length;
    for (let k = n; k < 50; k++)
      if (starts[k] >= 0) {
        e = starts[k];
        break;
      }
    const body = lines.slice(s, e);
    const stem = body[0] + (/\[\s*\d\s*점\s*\]/.test(body[0]) ? '' : ' ' + (body[1] ?? ''));
    // 선택지: 표시 기호로 시작하는 줄부터. 기호가 없으면 마지막 5줄
    let ci = body.findIndex((l, i) => i > 0 && CHOICE_START.test(l));
    let choices: string[];
    if (ci > 0) {
      choices = [];
      for (const l of body.slice(ci)) {
        if (CHOICE_START.test(l) || choices.length === 0) choices.push(l.replace(CHOICE_START, '').trim());
        else if (choices.length < 5 && !/다\.?$/.test(choices[choices.length - 1])) choices[choices.length - 1] += ' ' + l;
        else if (choices.length < 5) choices.push(l);
      }
    } else {
      ci = Math.max(1, body.length - 5);
      choices = body.slice(ci);
    }
    segs.push({ q: n, stem, passage: body.slice(1, ci), choices: choices.slice(0, 5) });
  }
  return segs;
}

// ── 3. 개념 키워드 색인 ─────────────────────────────────
const STOP = new Set(['왕', '인물', '나라', '시대', '사건', '제도', '정책', '단체', '문화', '설치', '실시', '조직', '건립', '편찬', '정비', '강화', '개혁', '운동', '전쟁', '조약', '정부', '고려', '조선', '신라', '백제', '고구려', '발해', '일본', '청', '원', '명', '당', '송', '미국', '중국', '러시아', '프랑스', '영국', '불교', '유교', '왕권강화', '호족', '귀족', '양반', '농민', '세금', '토지', '군대', '학교', '신문', '전투', '건국', '수용', '반포', '시행', '폐지', '창설', '파견', '저술', '설립', '발행', '선언', '참여', '활동', '항쟁', '봉기', '의병', '독립운동']);
function keywordsOf(c: Concept): string[] {
  const raw: string[] = [c.name, ...c.aliases];
  raw.push(c.name.replace(/\(.*?\)/g, ''));
  // 사건·정책·단체 이름의 첫 단어(예: '베트남 파병' → 베트남)
  if (['event', 'policy', 'group', 'state'].includes(c.kind)) {
    const first = c.name.replace(/\(.*?\)/g, '').split(/\s+/)[0].replace(/의$/, '');
    if (first.length >= 3) raw.push(first);
  }
  // 핵심 기억: 괄호 안 보충 설명(연도·다른 왕 이름 등)은 버리고 본문만
  for (const k of c.keys) {
    raw.push(...k.replace(/\(.*?\)/g, '').split(/[·,→/]|\s(?:vs|및)\s/));
    // 괄호 안 보충어는 3글자 이상만(헐버트·이원익 등은 살리고 태조·목종 같은 짧은 왕명은 제외)
    for (const m of k.matchAll(/\(([^)]*)\)/g)) raw.push(...m[1].split(/[·,]/).filter((x) => norm(x).replace(/[0-9]/g, '').length >= 3));
  }
  for (const f of c.facts) if (f.blank) raw.push(f.blank);
  const out = new Set<string>();
  for (const r of raw) {
    const n = norm(r.replace(/『|』|「|」/g, ''));
    const letters = n.replace(/[0-9]/g, '');
    if (letters.length < 2) continue; // '6년', '1차' 같은 숫자 위주 키워드 제외
    if (/^\d+(년|회|차|개|일|월|두|필|결|정보|조)/.test(n) && !/운동|전쟁|사태|선언|성명|혁명|항쟁|의거/.test(n)) continue;
    if (!STOP.has(n)) out.add(n);
  }
  return [...out];
}
const KW = new Map<string, string[]>(); // keyword -> conceptIds
for (const c of CONCEPTS) for (const k of keywordsOf(c)) KW.set(k, [...(KW.get(k) ?? []), c.id]);
const NC = CONCEPTS.length;
const idf = (k: string) => Math.log(NC / (KW.get(k)?.length ?? NC)) + 0.2;
const lengthBonus = (k: string) => Math.min(1.6, 0.6 + k.length * 0.15);

function scoreText(text: string, weight: number, acc: Map<string, { s: number; kws: Set<string> }>) {
  const t = norm(text);
  if (!t) return;
  for (const [k, ids] of KW) {
    if (!t.includes(k)) continue;
    // 더 긴 키워드에 포함된 짧은 키워드의 중복 점수는 줄인다
    const w = idf(k) * lengthBonus(k) * weight;
    for (const id of ids) {
      const cur = acc.get(id) ?? { s: 0, kws: new Set<string>() };
      if (!cur.kws.has(k)) {
        cur.s += w;
        cur.kws.add(k);
      }
      acc.set(id, cur);
    }
  }
}

// 문항 위치 → 대략적인 단원 기대(시험은 대체로 시대순) — 동점 정리에만 약하게 사용
const UNIT_ORDER = UNITS.map((u) => u.id);
function positionPrior(q: number, c: Concept): number {
  const idx = UNIT_ORDER.indexOf(c.unitId);
  if (c.unitId === 'u10') return 1; // 통합 단원은 위치 무관
  const expected = (q / 50) * 9; // u1..u9
  const d = Math.abs(idx - expected);
  return d <= 1.2 ? 1.25 : d <= 2.2 ? 1 : 0.8;
}

// ── 4. 문항 유형 ───────────────────────────────────────
function qType(stem: string): string {
  const s = norm(stem);
  if (/순서대로|일어난순서|옳게나열/.test(s)) return '순서';
  if (/옳지않은|않은것은/.test(s)) return '틀린 것';
  if (/시기|사이|그이후|그이전/.test(s)) return '시기';
  if (/문화유산|탑|불상|그림|유물/.test(s)) return '문화유산';
  if (/지역|곳|지도/.test(s)) return '지역';
  return '옳은 것';
}

// ── 실행 ───────────────────────────────────────────────
interface Tag {
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

const keys: Record<number, KeyItem[]> = {};
const tags: Record<number, Tag[]> = {};
mkdirSync('exam-pdfs/review', { recursive: true });

for (const r of ROUNDS) {
  keys[r] = parseKey(readFileSync(`exam-pdfs/text/${r}-a.txt`, 'utf8'));
  const qPath = `exam-pdfs/text/${r}-q.txt`;
  if (!existsSync(qPath)) {
    console.warn(`${r}: 문제지 텍스트 없음`);
    continue;
  }
  const segs = splitQuestions(readFileSync(qPath, 'utf8'));
  const review: string[] = [];
  tags[r] = segs.map((sg) => {
    const k = keys[r][sg.q - 1];
    const acc = new Map<string, { s: number; kws: Set<string> }>();
    scoreText(sg.stem, 1, acc);
    scoreText(sg.passage.join(' '), 1.6, acc);
    const negative = /옳지않은|않은것은/.test(norm(sg.stem));
    const correctIdx = k.ans.length === 1 ? k.ans[0] - 1 : -1;
    sg.choices.forEach((ch, i) => scoreText(ch, i === correctIdx && !negative && sg.choices.length === 5 ? 1.4 : 0.35, acc));
    const qt = qType(sg.stem);
    const typeBoost = (c: Concept) => (qt === '지역' ? (c.kind === 'place' ? 1.8 : 0.85) : qt === '문화유산' ? (c.kind === 'artifact' ? 1.4 : 1) : 1);
    const ranked = [...acc.entries()]
      .map(([id, v]) => {
        const c = CONCEPT_MAP.get(id)!;
        return { id, s: v.s * positionPrior(sg.q, c) * typeBoost(c), kws: [...v.kws] };
      })
      .sort((a, b) => b.s - a.s);
    const top = ranked[0];
    const second = ranked[1];
    // 정답 선택지만으로 본 개념
    let correct: string | null = null;
    if (correctIdx >= 0 && sg.choices.length === 5) {
      const ca = new Map<string, { s: number; kws: Set<string> }>();
      scoreText(sg.choices[correctIdx], 1, ca);
      const best = [...ca.entries()].sort((a, b) => b[1].s - a[1].s)[0];
      if (best && best[1].s >= 2.5) correct = best[0];
    }
    const conf: Tag['confidence'] = !top || top.s < 3 ? 'none' : top.s >= 9 && (!second || top.s >= second.s * 1.4) ? 'high' : top.s >= 5 ? 'mid' : 'low';
    const primary = conf === 'none' ? null : top.id;
    const related = ranked
      .slice(1, 6)
      .filter((x) => top && x.s >= top.s * 0.55 && x.s >= 4)
      .map((x) => x.id);
    const c = primary ? CONCEPT_MAP.get(primary)! : null;
    review.push(
      `${String(sg.q).padStart(2)} [${k.pts}점|${k.ans.join('/') || '없음'}|${qType(sg.stem)}|${conf}] ${c ? c.name : '—'}  ← ${top ? top.kws.slice(0, 5).join(',') : ''}` +
        `${related.length ? `  (+${related.map((id) => CONCEPT_MAP.get(id)!.name).join(', ')})` : ''}` +
        `${correct ? `  정답선지→${CONCEPT_MAP.get(correct)!.name}` : ''}\n      ${norm(sg.stem).slice(0, 40)} | ${norm(sg.passage.join(' ')).slice(0, 70)}`,
    );
    return {
      q: sg.q,
      pts: k.pts,
      ans: k.ans,
      type: qType(sg.stem),
      primary,
      related,
      correct,
      unit: c?.unitId ?? null,
      era: c?.era ?? null,
      confidence: conf,
      source: TEXT_LAYER.has(r) ? 'text' : 'ocr',
    } as Tag;
  });
  writeFileSync(`exam-pdfs/review/${r}.txt`, review.join('\n'));
  const found = tags[r].filter((t) => t.primary).length;
  console.log(`${r}: 정답표 OK, 태깅 ${found}/50 (high ${tags[r].filter((t) => t.confidence === 'high').length})`);
}

// ── 5. 빈도 집계 ───────────────────────────────────────
const analyzed = Object.keys(tags).map(Number);
const freq: Record<string, { q: number; rounds: number; primary: number }> = {};
for (const r of analyzed) {
  const seen = new Set<string>();
  for (const t of tags[r]) {
    const ids = [t.primary, ...(t.related ?? []), t.correct].filter(Boolean) as string[];
    const uniq = [...new Set(ids)];
    for (const id of uniq) {
      freq[id] ??= { q: 0, rounds: 0, primary: 0 };
      freq[id].q++;
      if (id === t.primary) freq[id].primary++;
      if (!seen.has(id)) {
        freq[id].rounds++;
        seen.add(id);
      }
    }
  }
}
const unitCount: Record<string, number> = {};
let tagged = 0;
for (const r of analyzed)
  for (const t of tags[r])
    if (t.unit) {
      unitCount[t.unit] = (unitCount[t.unit] ?? 0) + 1;
      tagged++;
    }

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  method:
    '공식 시험 자료실 PDF(정답표 24회 전부, 문제지 텍스트 9회 + Windows OCR 15회)에서 문항을 나누고, 앱 개념 사전의 키워드(이름·핵심어·빈칸어)를 IDF 가중치로 매칭해 문항별 주 개념을 자동 추정. 문항 본문은 저장하지 않음.',
  rounds: analyzed,
  keys,
  tags,
  frequency: freq,
  unitQuestionCount: unitCount,
  taggedQuestions: tagged,
  totalQuestions: analyzed.length * 50,
};
writeFileSync('src/content/examAnalysis.json', JSON.stringify(out));
console.log(`analysis: ${analyzed.length} rounds, tagged ${tagged}/${analyzed.length * 50}`);
console.log(
  'unit share:',
  UNITS.map((u) => `${u.no}:${(((unitCount[u.id] ?? 0) / Math.max(1, tagged)) * 100).toFixed(1)}%`).join(' '),
);
