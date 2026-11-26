import { describe, expect, it } from 'vitest';
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
});
