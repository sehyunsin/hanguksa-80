import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { CONCEPTS, UNIT_MAP } from '../content';
import { NEXT_EXAM } from '../content/official';
import { db } from '../db/db';
import { getSession, startSession } from '../db/repo';
import { levelFromXp, streak } from '../engine/gamify';
import { BUCKETS, BUCKET_LABEL } from '../engine/model';
import { dayKey, daysBetween } from '../engine/util';
import { useDailyMap, usePlan, useToday } from '../ui/hooks';
import { Button, Card, Chip, Icon, Progress, Ring, Section, Stat, cx } from '../ui/kit';
import { go } from '../ui/router';

export default function Home() {
  const data = usePlan();
  const today = useToday();
  const dailyMap = useDailyMap();
  const session = useLiveQuery(() => getSession(), []);
  const [busy, setBusy] = useState(false);
  if (!data || !today || !dailyMap) return <div className="p-8 text-center text-muted">불러오는 중…</div>;
  const { plan, settings, mastery } = data;

  const spent = BUCKETS.reduce((a, b) => a + (today.seconds?.[b] ?? 0), 0);
  const goalSec = settings.dailyMinutes * 60;
  const done = Math.min(1, spent / goalSec);
  const now = Date.now();
  const due = [...mastery.values()].filter((m) => m.level > 0 && m.due <= now).length;
  const lv = levelFromXp(settings.xp);
  const st = streak(dailyMap);
  const unit = UNIT_MAP.get(plan.currentUnitId);
  const dday = daysBetween(dayKey(), settings.examDate);
  const todayKey = dayKey();
  const applyOpen = todayKey >= '2027-01-05' && todayKey <= NEXT_EXAM.applyEnd.slice(0, 10) && settings.examDate === NEXT_EXAM.date;

  const start = async () => {
    setBusy(true);
    try {
      if (!session) await startSession('daily');
      go('learn');
    } finally {
      setBusy(false);
    }
  };
  const newStart = async () => {
    setBusy(true);
    await startSession('daily');
    go('learn');
  };

  return (
    <div className="pb-4">
      <header className="safe-top flex items-center justify-between pb-2">
        <div>
          <div className="text-xs font-semibold text-muted">한국사능력검정시험 심화 · 목표 3급</div>
          <div className="text-2xl font-black tracking-tight">
            {dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : '시험 종료'}
            <span className="ml-2 text-sm font-semibold text-muted">{settings.examDate.replace(/-/g, '.')} 시험</span>
          </div>
        </div>
        <button onClick={() => go('settings')} aria-label="설정" className="rounded-full p-2 text-muted">
          <Icon name="gear" />
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="연속 학습" value={<span className="flex items-center gap-1 text-xp"><Icon name="flame" fill size={20} />{st}일</span>} />
        <Stat label={`레벨 ${lv.level}`} value={<span className="text-brand">{settings.xp.toLocaleString()}</span>} sub={<Progress value={lv.progress} h="h-1.5" className="mt-1" color="bg-xp" />} />
        <Stat label="복습 필요" value={`${due}개`} sub="개념" />
      </div>

      {applyOpen && (
        <Card className="mt-3 border-warn/40 bg-warn2">
          <div className="text-sm font-bold text-warn">제82회 원서 접수 기간을 확인하세요</div>
          <div className="mt-1 text-sm">정기 접수 2027.1.12.(화) 10:00 ~ 1.19.(화) 17:00 · 공식 홈페이지 공지 기준</div>
        </Card>
      )}

      <Card className="mt-3">
        <div className="flex items-center gap-4">
          <Ring value={done} size={112}>
            <div className="text-2xl font-black tabular-nums">{Math.floor(spent / 60)}</div>
            <div className="text-xs text-muted">/ {settings.dailyMinutes}분</div>
          </Ring>
          <div className="min-w-0 flex-1 space-y-1.5">
            {BUCKETS.filter((b) => plan.budgets[b] > 0).map((b) => (
              <div key={b}>
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{BUCKET_LABEL[b]}</span>
                  <span className="tabular-nums">
                    {Math.floor((today.seconds?.[b] ?? 0) / 60)}/{plan.budgets[b]}분
                  </span>
                </div>
                <Progress value={(today.seconds?.[b] ?? 0) / (plan.budgets[b] * 60)} h="h-1.5" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {session ? (
            <>
              <Button big onClick={start} disabled={busy}>
                <Icon name="play" fill size={18} /> 이어서 학습하기 ({session.index}/{session.plan.items.length})
              </Button>
              <Button variant="ghost" onClick={newStart} disabled={busy}>
                새 세션으로 시작
              </Button>
            </>
          ) : (
            <Button big onClick={start} disabled={busy || plan.phase === 4}>
              <Icon name="play" fill size={18} /> {spent >= goalSec ? '추가 학습하기' : '오늘의 학습 시작'}
            </Button>
          )}
          <div className="text-center text-xs text-muted">한 번에 약 {settings.sessionMinutes}분 · 언제 멈춰도 이어서 할 수 있어요</div>
        </div>
      </Card>

      {plan.mockDay && (
        <Card className="mt-3 border-brand/30 bg-brand2" onClick={() => go('exam')}>
          <div className="flex items-center gap-3">
            <Icon name="target" className="text-brand" />
            <div>
              <div className="font-bold text-brand">오늘은 실전 모의고사 점검일</div>
              <div className="text-sm">이 시점 목표 {plan.mockDay.score}점 · 실전 시험 탭에서 응시하세요</div>
            </div>
          </div>
        </Card>
      )}

      <Section title="지금 진행 중" right={<Chip tone="brand">Day {Math.max(1, plan.dayIndex)}/{plan.totalDays}</Chip>}>
        <Card onClick={() => go(`map/${plan.currentUnitId}`)}>
          <div className="text-xs font-semibold text-muted">{plan.phase}단계 · {plan.phaseLabel}</div>
          <div className="mt-1 text-lg font-extrabold">
            UNIT {unit?.no}. {unit?.title}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Progress value={plan.introduced / CONCEPTS.length} />
            <span className="shrink-0 tabular-nums text-muted">
              {plan.introduced}/{CONCEPTS.length}
            </span>
          </div>
          <div className={cx('mt-2 text-sm', plan.behind > 0 ? 'text-warn' : 'text-muted')}>
            {plan.phase === 1
              ? plan.behind > 0
                ? `계획보다 개념 ${plan.behind}개 늦어요 → 실제 기출에 자주 나온 개념부터 나눠서 따라잡아요`
                : `오늘 새로 배울 개념 약 ${plan.newQuota}개`
              : '모든 시대 기본 학습 기간이 끝났어요. 기출 유형·오답·실전 위주로 진행합니다.'}
          </div>
        </Card>
      </Section>

      <Section title="빠른 실행">
        <div className="grid grid-cols-2 gap-2">
          <QuickBtn label="복습만 하기" sub={`${due}개 예정`} onClick={async () => (await startSession('review'), go('learn'))} />
          <QuickBtn label="취약 개념 집중" sub="오답·헷갈린 개념" onClick={async () => (await startSession('weak'), go('learn'))} />
          <QuickBtn label="기출 유형 연습" sub="5지선다 실전형" onClick={async () => (await startSession('apply'), go('learn'))} />
          <QuickBtn label="오답 노트" sub="원인별 정리" onClick={() => go('review/wrongs')} />
        </div>
      </Section>

      <ContentNotice />
    </div>
  );
}

function QuickBtn({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl border border-line bg-card p-3 text-left active:scale-[0.99]">
      <div className="font-bold">{label}</div>
      <div className="text-xs text-muted">{sub}</div>
    </button>
  );
}

function ContentNotice() {
  const verified = CONCEPTS.filter((c) => c.status === 'verified').length;
  const partial = CONCEPTS.filter((c) => c.status === 'partial').length;
  const count = useLiveQuery(() => db.papers.count(), []);
  return (
    <Card className="mt-6" onClick={() => go('about')}>
      <div className="flex items-start gap-3">
        <Icon name="info" className="mt-0.5 shrink-0 text-muted" />
        <div className="text-sm text-muted">
          학습 콘텐츠 {CONCEPTS.length}개 개념 중 출처 대조 완료 {verified}개 · 일부 확인 {partial}개 · 검증 대기 {CONCEPTS.length - verified - partial}개. 실제 기출 문제지 {count ?? 0}개 등록됨.
          <span className="ml-1 font-semibold text-brand">자료 현황 보기</span>
        </div>
      </div>
    </Card>
  );
}
