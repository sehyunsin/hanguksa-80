import { useLiveQuery } from 'dexie-react-hooks';
import { CONCEPTS, CONCEPT_MAP, UNITS } from '../content';
import { ANALYSIS, unitShare } from '../content/exams';
import { db } from '../db/db';
import { badges, weekSummary } from '../engine/gamify';
import { BUCKETS } from '../engine/model';
import { gradeLabel } from '../engine/exam';
import { isScheduled, retrievability } from '../engine/srs';
import { addDays, dayKey, daysBetween } from '../engine/util';
import { useDailyMap, usePlan } from '../ui/hooks';
import { Card, Chip, Empty, Header, Icon, Progress, Section, Stat, cx, fmtMin, pct } from '../ui/kit';
import { go } from '../ui/router';

export default function StatsScreen() {
  const data = usePlan();
  const dailyMap = useDailyMap();
  const since = addDays(dayKey(), -6);
  const recent = useLiveQuery(() => db.history.where('day').aboveOrEqual(since).toArray(), [since]);
  const exams = useLiveQuery(() => db.exams.orderBy('ts').toArray(), []);
  const wrongs = useLiveQuery(() => db.wrongs.toArray(), []);
  if (!data || !dailyMap || !recent || !exams || !wrongs) return null;
  const { mastery, settings, plan } = data;
  const now = Date.now();
  const intro = [...mastery.values()].filter((m) => m.level > 0);
  const totalSec = [...dailyMap.values()].reduce((a, d) => a + BUCKETS.reduce((s, b) => s + (d.seconds?.[b] ?? 0), 0), 0);
  const answered = recent.filter((h) => h.kind !== 'intro');
  const acc = answered.length ? answered.filter((h) => h.correct).length / answered.length : 0;
  const sched = intro.filter(isScheduled);
  const avgR = sched.length ? sched.reduce((a, m) => a + retrievability(m, now), 0) / sched.length : 0;
  const levels = [0, 1, 2, 3, 4, 5].map((l) => CONCEPTS.filter((c) => (mastery.get(c.id)?.level ?? 0) === l).length);
  const today = dailyMap.get(dayKey());
  const todaySec = today ? BUCKETS.reduce((s, b) => s + (today.seconds?.[b] ?? 0), 0) : 0;
  const week = weekSummary(dailyMap, settings.dailyMinutes);
  const last = exams[exams.length - 1];
  const prev = exams[exams.length - 2];

  const unitStats = UNITS.map((u) => {
    const cs = CONCEPTS.filter((c) => c.unitId === u.id);
    const seen = cs.filter((c) => (mastery.get(c.id)?.level ?? 0) > 0);
    const tot = seen.reduce((a, c) => a + (mastery.get(c.id)!.correct + mastery.get(c.id)!.wrong), 0);
    const cor = seen.reduce((a, c) => a + mastery.get(c.id)!.correct, 0);
    return { u, cs, seen: seen.length, acc: tot ? cor / tot : null, avgLevel: cs.reduce((a, c) => a + (mastery.get(c.id)?.level ?? 0), 0) / cs.length };
  });
  const weakUnits = unitStats.filter((s) => s.acc !== null && s.seen >= 3).sort((a, b) => a.acc! - b.acc!).slice(0, 3);
  const weakConcepts = intro
    .filter((m) => m.wrong > 0)
    .sort((a, b) => b.wrong / (b.seen || 1) - a.wrong / (a.seen || 1) || retrievability(a, now) - retrievability(b, now))
    .slice(0, 10);
  const bs = badges({ mastery, daily: dailyMap, wrongs, exams });

  return (
    <div>
      <Header title="학습 통계" />
      <div className="grid grid-cols-2 gap-2">
        <Stat label="시험까지" value={`D-${Math.max(0, daysBetween(dayKey(), settings.examDate))}`} sub={`Day ${Math.max(1, plan.dayIndex)}/${plan.totalDays}`} />
        <Stat label="오늘 학습 완료율" value={pct(Math.min(1, todaySec / (settings.dailyMinutes * 60)))} sub={`${Math.floor(todaySec / 60)}/${settings.dailyMinutes}분`} />
        <Stat label="전체 커리큘럼 학습률" value={pct(intro.length / CONCEPTS.length)} sub={`${intro.length}/${CONCEPTS.length} 개념`} />
        <Stat label="누적 실제 학습시간" value={fmtMin(totalSec)} sub="화면을 보고 푼 시간만" />
        <Stat label="최근 7일 정답률" value={answered.length ? pct(acc) : '-'} sub={`${answered.length}문항`} />
        <Stat label="장기 기억 유지 추정" value={sched.length ? pct(avgR) : '-'} sub={`FSRS 추정 · ${sched.length}개 기준`} />
        <Stat label="최근 모의고사" value={last ? `${last.score}점` : '-'} sub={last ? `${gradeLabel(last.score)} · ${last.kind === 'official' ? '실제 기출' : '창작'}` : '응시 전'} />
        <Stat
          label="점수 변화"
          value={last && prev ? `${last.score - prev.score >= 0 ? '+' : ''}${last.score - prev.score}` : '-'}
          tone={last && prev ? (last.score >= prev.score ? 'text-ok' : 'text-bad') : ''}
          sub="직전 시험 대비"
        />
      </div>

      <Section title="이번 주 학습" right={<span className="text-xs text-muted">목표 달성 {week.goalDays}/7일</span>}>
        <Card>
          <div className="flex h-28 items-end gap-2">
            {week.minutes.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div className={cx('w-full rounded-t-lg', m >= settings.dailyMinutes ? 'bg-ok' : 'bg-brand')} style={{ height: `${Math.min(100, (m / settings.dailyMinutes) * 100)}%`, minHeight: m ? 4 : 0 }} />
                </div>
                <div className="text-[10px] text-muted">{week.days[i].slice(8)}</div>
              </div>
            ))}
          </div>
          <div className="mt-1 text-xs text-muted">
            주간 {week.total}분 / 목표 {week.target}분
          </div>
        </Card>
      </Section>

      <Section title="시대별 진행률">
        <Card>
          <ul className="space-y-2.5">
            {unitStats.map((s) => (
              <li key={s.u.id}>
                <button className="w-full text-left" onClick={() => go(`map/${s.u.id}`)}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">
                      {s.u.no}. {s.u.title}
                    </span>
                    <span className="text-muted tabular-nums">
                      {s.seen}/{s.cs.length}
                      {s.acc !== null && ` · 정답 ${pct(s.acc)}`}
                    </span>
                  </div>
                  <Progress value={s.seen / s.cs.length} className="mt-1" color={s.acc !== null && s.acc < 0.6 ? 'bg-warn' : 'bg-brand'} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="실제 기출 단원별 출제 비중" right={<span className="text-xs text-muted">제57~80회 자동 분석</span>}>
        <Card>
          <ul className="space-y-1.5">
            {UNITS.map((u) => {
              const sh = unitShare()[u.id] ?? 0;
              return (
                <li key={u.id} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate">
                    {u.no}. {u.title}
                  </span>
                  <Progress value={sh / 0.2} h="h-2" color="bg-brand" />
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{(sh * 100).toFixed(1)}%</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">문항 {ANALYSIS.taggedQuestions}/{ANALYSIS.totalQuestions}개에 자동으로 붙인 주 개념 기준(추정치). 오늘의 학습 우선순위와 창작 모의고사 문항 배분에 반영돼요.</p>
        </Card>
      </Section>

      <Section title="개념별 숙련도 분포">
        <Card>
          <div className="flex h-24 items-end gap-2">
            {levels.map((n, l) => (
              <div key={l} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[11px] font-bold tabular-nums">{n}</div>
                <div className={cx('w-full rounded-t-lg', l >= 4 ? 'bg-ok' : l === 0 ? 'bg-card2' : 'bg-brand')} style={{ height: `${(n / CONCEPTS.length) * 100}%`, minHeight: n ? 3 : 0 }} />
                <div className="text-[10px] text-muted">{l === 0 ? '미학습' : `Lv${l}`}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Lv4 이상은 하루 이상 간격을 두고 기출형 문제까지 통과한 개념이에요.</p>
        </Card>
      </Section>

      <Section title="취약 시대">
        {weakUnits.length ? (
          <div className="flex flex-wrap gap-2">
            {weakUnits.map((s) => (
              <Chip key={s.u.id} tone="warn" className="text-sm">
                {s.u.title} · {pct(s.acc!)}
              </Chip>
            ))}
          </div>
        ) : (
          <Empty>시대별로 3개 이상 학습하면 표시돼요.</Empty>
        )}
      </Section>

      <Section title="취약 개념">
        {weakConcepts.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {weakConcepts.map((m) => (
              <button key={m.conceptId} onClick={() => go(`concept/${m.conceptId}`)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
                <span className="font-semibold">{CONCEPT_MAP.get(m.conceptId)?.name}</span>
                <span className="text-xs text-muted tabular-nums">
                  오답 {m.wrong}/{m.seen} · 기억 {pct(retrievability(m, now))}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty>틀린 개념이 생기면 여기에 모여요.</Empty>
        )}
      </Section>

      <Section title="배지">
        <div className="grid grid-cols-2 gap-2">
          {bs.map((b) => (
            <div key={b.id} className={cx('rounded-2xl border p-3', b.earned ? 'border-xp/50 bg-card' : 'border-line bg-card opacity-60')}>
              <div className="flex items-center gap-1.5 font-bold">
                <Icon name={b.earned ? 'star' : 'lock'} fill={b.earned} size={16} className={b.earned ? 'text-xp' : 'text-muted'} />
                <span className="truncate">{b.label}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {b.desc}
                {b.progress && ` (${b.progress})`}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
