import { CONCEPT_MAP, CONCEPTS, EXAM_UNIT, UNITS } from '../content';
import { frequencyOf } from '../content/exams';
import { startSession } from '../db/repo';
import { usePlan } from '../ui/hooks';
import { Button, Card, Chip, Header, Icon, LevelDots, Progress, cx } from '../ui/kit';
import { go } from '../ui/router';

const freqTone = (id: string) => {
  const l = frequencyOf(id).level;
  return l === '상' ? 'text-bad' : l === '중' ? 'text-warn' : 'text-muted';
};

export default function MapScreen({ openUnit }: { openUnit?: string }) {
  const data = usePlan();
  if (!data) return null;
  const { mastery, plan } = data;
  const lvl = (id: string) => mastery.get(id)?.level ?? 0;

  return (
    <div>
      <Header title="학습 지도" />
      <p className="mb-4 px-1 text-sm text-muted">시대 순서대로 진행해요. 이미 배운 단원이나 앞으로 배울 레슨도 자유롭게 열어 볼 수 있어요.</p>
      <ol className="relative space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[27px] before:w-1 before:rounded-full before:bg-line">
        {UNITS.map((u) => {
          const cs = CONCEPTS.filter((c) => c.unitId === u.id);
          const intro = cs.filter((c) => lvl(c.id) > 0).length;
          const avg = cs.reduce((a, c) => a + lvl(c.id), 0) / cs.length;
          const sched = plan.units.find((x) => x.unitId === u.id);
          const open = openUnit === u.id;
          const current = plan.currentUnitId === u.id;
          return (
            <li key={u.id} className="relative pl-14">
              <button
                onClick={() => go(open ? 'map' : `map/${u.id}`)}
                className={cx('absolute top-2 left-1 flex h-12 w-12 items-center justify-center rounded-full border-4 text-lg font-black text-white shadow', current ? 'border-brand2 ring-4 ring-brand/30' : 'border-bg')}
                style={{ background: intro === cs.length ? 'var(--ok)' : u.color }}
                aria-label={`UNIT ${u.no}`}
              >
                {intro === cs.length ? <Icon name="check" /> : u.no}
              </button>
              <Card onClick={() => go(open ? 'map' : `map/${u.id}`)} className={cx(current && 'border-brand/50')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-muted">
                      UNIT {u.no}
                      {sched && ` · Day ${sched.startDay}–${sched.endDay}`}
                    </div>
                    <div className="truncate text-[17px] font-extrabold">{u.title}</div>
                    <div className="truncate text-xs text-muted">{u.subtitle}</div>
                  </div>
                  {current && <Chip tone="brand">진행 중</Chip>}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={intro / cs.length} />
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {intro}/{cs.length} · 숙련 {avg.toFixed(1)}
                  </span>
                </div>
              </Card>
              {open && (
                <div className="anim-up mt-2 space-y-2">
                  {u.lessons.map((l) => {
                    const lc = l.conceptIds.map((id) => CONCEPT_MAP.get(id)!);
                    const li = lc.filter((c) => lvl(c.id) > 0).length;
                    return (
                      <div key={l.id} className="rounded-2xl border border-line bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold">{l.title}</div>
                            <div className="text-xs text-muted">
                              개념 {li}/{lc.length}
                            </div>
                          </div>
                          <Button variant={li < lc.length ? 'primary' : 'soft'} onClick={async () => (await startSession('lesson', { lessonId: l.id }), go('learn'))}>
                            {li < lc.length ? '학습' : '연습'}
                          </Button>
                        </div>
                        <ul className="mt-2 divide-y divide-line">
                          {lc.map((c) => (
                            <li key={c.id}>
                              <button onClick={() => go(`concept/${c.id}`)} className="flex w-full items-center justify-between gap-2 py-2 text-left">
                                <span className="min-w-0 truncate text-[15px]">
                                  <span
                                    title="최근 24회 중 출제된 회차 수"
                                    className={cx('mr-1.5 inline-block w-6 text-center text-[11px] font-bold tabular-nums', freqTone(c.id))}
                                  >
                                    {frequencyOf(c.id).rounds}
                                  </span>
                                  {c.name}
                                </span>
                                <LevelDots level={lvl(c.id)} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
        <li className="relative pl-14">
          <button onClick={() => go('exam')} className="absolute top-2 left-1 flex h-12 w-12 items-center justify-center rounded-full border-4 border-bg text-white shadow" style={{ background: EXAM_UNIT.color }} aria-label="UNIT 11">
            <Icon name="exam" />
          </button>
          <Card onClick={() => go('exam')}>
            <div className="text-xs font-semibold text-muted">
              UNIT 11 · Day {plan.learnEnd + 1}–{plan.totalDays}
            </div>
            <div className="text-[17px] font-extrabold">{EXAM_UNIT.title}</div>
            <div className="text-xs text-muted">{EXAM_UNIT.subtitle}</div>
          </Card>
        </li>
      </ol>
      <p className="mt-4 px-1 text-xs text-muted">개념 앞 숫자는 최근 심화 24개 회차(제57~80회) 중 관련 문항이 나온 회차 수예요(공식 기출 PDF 자동 분석 추정치). 빨강은 절반 이상, 주황은 20% 이상.</p>
    </div>
  );
}
