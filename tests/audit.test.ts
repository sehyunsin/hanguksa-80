import { describe, expect, it } from 'vitest';
import { blankIssues, nameLeaks, riskPairs, staleExceptions } from '../scripts/audit-lib';
import { CONCEPTS, CONCEPT_MAP, FACT_MAP } from '../src/content';
import { Balancer, alsoFits, generate, leaksName, spanOf, type GenCtx, type QKind } from '../src/engine/questions';
import { mulberry32 } from '../src/engine/util';

const ctx = (seed = 1): GenCtx => ({ rng: mulberry32(seed), balancer: new Balancer(mulberry32(seed + 7)) });
const tight = (s: string) => s.replace(/[『』「」\s·]/g, '');

describe('문제 재료 점검(scripts/audit-questions.ts)', () => {
  it('다른 개념에도 해당할 수 있는 사실은 모두 사람이 판단해 기록되어 있다(src/content/overlaps.ts)', () => {
    const open = riskPairs().filter((p) => p.handled === 'unreviewed');
    expect(open.map((p) => `${p.id} ${p.target.name} ← “${p.fact.text}” (${p.detail})`)).toEqual([]);
    expect(staleExceptions()).toEqual([]);
  });

  it('직접 쓴 자료에 정답 이름이 없고, 빈칸어는 문장에 있다', () => {
    expect(nameLeaks().clues).toEqual([]);
    expect(blankIssues().missing).toEqual([]);
  });

  it('생성된 문제가 예외 목록을 지킨다: 오답 사실은 대상에 해당하지 않고, 누구 문제의 오답 후보는 그 사실에 해당하지 않는다', () => {
    const kinds: QKind[] = ['ox', 'mc_who', 'mc_fact', 'clue5', 'wrong5', 'sort2', 'match', 'cloze'];
    let n = 0;
    for (const c of CONCEPTS)
      for (const k of kinds)
        for (let s = 0; s < 4; s++) {
          const q = generate(c, [k], ctx(++n));
          const tag = `${c.id}/${q.kind}`;
          if (q.kind === 'ox' && q.relatedIds.length) {
            const f = FACT_MAP.get([...FACT_MAP.values()].find((x) => x.text === q.passage![0] && x.conceptId === q.relatedIds[0])!.id)!;
            expect(alsoFits(f, c), tag).toBe(false);
          }
          if (q.kind === 'mc_fact' || q.kind === 'clue5') {
            for (const ch of q.choices!.filter((x) => !x.correct)) expect(alsoFits(FACT_MAP.get(ch.id)!, c), `${tag} ${ch.text}`).toBe(false);
          }
          if (q.kind === 'wrong5') {
            const bad = q.choices!.find((x) => x.correct)!;
            expect(alsoFits(FACT_MAP.get(bad.id)!, c), `${tag} ${bad.text}`).toBe(false);
          }
          if (q.kind === 'mc_who') {
            const f = c.facts.find((x) => x.text === q.passage![0])!;
            for (const ch of q.choices!.filter((x) => !x.correct)) expect(alsoFits(f, CONCEPT_MAP.get(ch.id)!), `${tag} ${ch.text}`).toBe(false);
            // 자료에 정답 이름이 드러나지 않음
            expect(leaksName(f, c), `${tag} ${q.passage![0]}`).toBe(false);
          }
          if (q.kind === 'sort2') {
            const a = CONCEPT_MAP.get(q.conceptId)!;
            const b = CONCEPT_MAP.get(q.relatedIds[0])!;
            for (const it of q.sortItems!) expect(alsoFits(FACT_MAP.get(it.id)!, it.group === 'A' ? b : a), `${tag} ${it.text}`).toBe(false);
          }
          if (q.kind === 'match') {
            for (const p of q.pairs!)
              for (const o of q.pairs!) if (o.leftId !== p.leftId) expect(alsoFits(FACT_MAP.get(p.rightId)!, CONCEPT_MAP.get(o.leftId)!), `${tag} ${p.right}`).toBe(false);
          }
          if (q.kind === 'cloze') {
            const ans = q.choices!.find((x) => x.correct)!.text;
            expect(q.passage![0].includes(ans), `${tag} 빈칸 노출`).toBe(false);
            // 오답이 정답을 품거나 정답에 품기지 않음(사비/사비성)
            for (const w of q.choices!.filter((x) => !x.correct)) expect(tight(w.text).includes(tight(ans)) || tight(ans).includes(tight(w.text)), `${tag} ${ans}/${w.text}`).toBe(false);
          }
        }
    expect(n).toBeGreaterThan(9000);
  });

  it('연도 문제는 단일 연도 사건만, 순서 문제의 항목은 시기 범위가 서로 겹치지 않는다', () => {
    let n = 0;
    for (const c of CONCEPTS) {
      const y = generate(c, ['year'], ctx(++n));
      if (y.kind === 'year') expect(c.when, c.id).toMatch(/^\d{3,4}년(?!대)/);
      for (const k of ['order', 'order5'] as QKind[]) {
        const q = generate(c, [k], ctx(++n));
        if (q.kind !== k) continue;
        const ids = q.kind === 'order' ? q.correctOrder! : [q.conceptId, ...q.relatedIds];
        const spans = ids.map((id) => spanOf(CONCEPT_MAP.get(id)!)).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) expect(spans[i - 1][1] < spans[i][0], `${c.id}/${k} ${JSON.stringify(spans)}`).toBe(true);
      }
    }
  });
});
