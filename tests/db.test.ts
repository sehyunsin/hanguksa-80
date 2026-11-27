import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPT_MAP } from '../src/content';
import { StudyDB } from '../src/db/db';
import { exportBackup, getSession, importBackup, masteryMap, recordAnswer, recordIntro, startSession } from '../src/db/repo';
import { grade } from '../src/engine/questions';

describe('로컬 DB · 세션 · 백업', () => {
  it('세션을 진행하면 숙련도·일일 기록이 쌓이고, 다시 열어도 이어서 진행된다', async () => {
    const d = new StudyDB(`t-${Math.random()}`);
    let st = await startSession('daily', {}, d);
    expect(st.plan.items.length).toBeGreaterThan(3);
    // 소개 + 문제 3개 진행
    for (let i = 0; i < 4; i++) {
      const it = st.plan.items[st.index];
      if (it.type === 'intro') st = await recordIntro(st, it, 30000, d);
      else {
        const q = it.q!;
        const right = q.choices?.find((c) => c.correct);
        const g = right
          ? grade(q, { type: 'choice', choiceId: right.id })
          : q.kind === 'short'
            ? grade(q, { type: 'text', text: q.answer! })
            : q.kind === 'order'
              ? grade(q, { type: 'order', ids: q.correctOrder! })
              : q.kind === 'match'
                ? grade(q, { type: 'pairs', map: Object.fromEntries(q.pairs!.map((p) => [p.leftId, p.rightId])) })
                : grade(q, { type: 'sort', map: Object.fromEntries(q.sortItems!.map((s) => [s.id, s.group])) });
        const out = await recordAnswer(st, it, g, 8000, 'sure', d);
        expect(out.correct).toBe(true);
        st = out.state;
      }
    }
    const resumed = await getSession(d);
    expect(resumed?.index).toBe(4);
    const m = await masteryMap(d);
    expect(m.size).toBeGreaterThan(0);
    const day = await d.daily.toArray();
    expect(day[0].items).toBeGreaterThan(0);

    // 백업 → 다른 DB로 복원
    const backup = JSON.parse(JSON.stringify(await exportBackup(d)));
    const d2 = new StudyDB(`t2-${Math.random()}`);
    const { counts } = await importBackup(backup, d2);
    expect(counts.mastery).toBe(m.size);
    expect((await masteryMap(d2)).size).toBe(m.size);
    await expect(importBackup({ foo: 1 }, d2)).rejects.toThrow();
  });

  it('앱 업데이트로 콘텐츠에서 빠진 개념의 기록이 남아 있어도 멈추지 않고, 그 기록은 지우지 않는다', async () => {
    const d = new StudyDB(`t3-${Math.random()}`);
    let st = await startSession('daily', {}, d);
    const it0 = st.plan.items[0];
    st = it0.type === 'intro' ? await recordIntro(st, it0, 20000, d) : st;
    const real = [...(await masteryMap(d)).values()][0] ?? (await d.mastery.toArray())[0];
    // 옛 버전에만 있던 개념의 기록 + 혼동 짝 + 진행 중 세션을 흉내 냄
    if (real) await d.mastery.put({ ...real, conceptId: 'removed-old-concept', level: 3 });
    await d.confusions.put({ pair: 'gg-jangsu|removed-old-concept', a: 'gg-jangsu', b: 'removed-old-concept', count: 3, lastTs: Date.now(), resolvedCount: 0 });
    const cur = (await d.session.get('current'))!;
    await d.session.put({ ...cur, plan: { ...cur.plan, items: [...cur.plan.items, { ...cur.plan.items[0], id: 'x', conceptId: 'removed-old-concept' }] } });

    expect((await masteryMap(d)).has('removed-old-concept')).toBe(false); // 화면·계획에서는 무시
    expect(await d.mastery.get('removed-old-concept')).toBeDefined(); // 기록은 그대로(백업에도 포함)
    expect(await getSession(d)).toBeUndefined(); // 없어진 개념이 든 세션은 이어 하지 않음
    for (const mode of ['daily', 'review', 'weak'] as const) await expect(startSession(mode, {}, d)).resolves.toBeDefined();
  });

  it('배포판에서 쓰던 개념 ID가 모두 남아 있다(지우면 사용자 학습 기록이 끊김)', () => {
    const released = JSON.parse(readFileSync('tests/released-concepts.json', 'utf8')) as { ids: string[] };
    expect(released.ids.filter((id) => !CONCEPT_MAP.has(id))).toEqual([]);
  });
});
