import { useEffect, useRef, useState } from 'react';
import { CONCEPT_MAP } from '../content';
import { db, type SessionState } from '../db/db';
import { finishSession, getSession, getSettings, masteryMap, recordAnswer, recordIntro, setUserCause, startSession } from '../db/repo';
import { CAUSE_LABEL, type Confidence, type WrongCause } from '../engine/model';
import { Balancer, KIND_LABEL, KIND_SECONDS, generate, grade, type Grade, type QKind, type Response } from '../engine/questions';
import type { SessionItem } from '../engine/session';
import { kindsForLevel } from '../engine/session';
import { defaultRng, uid } from '../engine/util';
import { useActiveTimer } from '../ui/hooks';
import { Button, Chip, Confetti, Icon, Progress, Sheet, cx, fmtMin } from '../ui/kit';
import QuestionView from '../ui/QuestionView';
import { go } from '../ui/router';
import { ConceptBody } from './ConceptScreen';

const USER_CAUSES: WrongCause[] = ['knowledge', 'person_confusion', 'achievement_confusion', 'concept_confusion', 'era_confusion', 'misread', 'slip', 'false_memory'];

export default function LearnScreen() {
  const [st, setSt] = useState<SessionState | null | undefined>(undefined);
  const [resp, setResp] = useState<Response | null>(null);
  const [unsure, setUnsure] = useState(false);
  const [result, setResult] = useState<{ g: Grade; cause?: WrongCause; wrongId?: number; xp: number } | null>(null);
  const [userCause, setUC] = useState<WrongCause | null>(null);
  const [showConcept, setShowConcept] = useState(false);
  const [askCause, setAskCause] = useState(true);
  const [done, setDone] = useState<{ xp: number; acc: number; ms: number; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const retried = useRef(new Set<string>());
  const pendingRef = useRef<SessionState | null>(null);

  useEffect(() => {
    getSession().then((s) => setSt(s ?? null));
    getSettings().then((s) => setAskCause(s.askCause));
  }, []);

  const item: SessionItem | undefined = st ? st.plan.items[st.index] : undefined;
  const timer = useActiveTimer(item?.id);

  useEffect(() => {
    setResp(null);
    setUnsure(false);
    setResult(null);
    setUC(null);
  }, [item?.id]);

  // 세션 끝
  useEffect(() => {
    if (st && !item && !done) {
      const correct = st.results.filter((r) => r.correct).length;
      finishSession(st).then(({ xp }) => setDone({ xp, acc: st.results.length ? correct / st.results.length : 1, ms: st.activeMs, n: st.results.length }));
    }
  }, [st, item, done]);

  if (st === undefined) return <div className="p-8 text-center text-muted">불러오는 중…</div>;
  if (st === null && !done)
    return (
      <div className="p-8 text-center">
        <p className="text-muted">진행 중인 세션이 없어요.</p>
        <Button className="mt-4" onClick={async () => setSt(await startSession('daily'))}>
          오늘의 학습 시작
        </Button>
      </div>
    );

  if (done)
    return (
      <Complete
        done={done}
        onNext={async () => {
          const ns = await startSession('daily');
          retried.current.clear();
          setDone(null);
          setSt(ns);
        }}
      />
    );
  if (!st || !item) return null;

  const c = CONCEPT_MAP.get(item.conceptId)!;
  const total = st.plan.items.length;

  const onIntroDone = async () => {
    setBusy(true);
    const next = await recordIntro(st, item, timer.stop());
    setSt(next);
    setBusy(false);
  };

  const onCheck = async () => {
    if (!item.q || !resp) return;
    setBusy(true);
    const g = grade(item.q, resp);
    const confidence: Confidence = unsure ? 'unsure' : 'sure';
    const out = await recordAnswer(st, item, g, timer.stop(), confidence);
    let state = out.state;
    // 오답이면 같은 개념을 다른 유형으로 세션 끝에 다시 출제(세션당 1회)
    if (!g.correct && !retried.current.has(item.conceptId)) {
      retried.current.add(item.conceptId);
      const mm = await masteryMap();
      const known = new Set([...mm.values()].filter((m) => m.level > 0).map((m) => m.conceptId));
      const kinds = kindsForLevel(Math.max(1, (out.mastery.level ?? 1) - 1), defaultRng, item.q.kind).filter((k) => k !== item.q!.kind) as QKind[];
      const q = generate(c, kinds, { rng: defaultRng, balancer: new Balancer(), known });
      const extra: SessionItem = { id: uid(), type: 'question', bucket: 'weak', conceptId: c.id, q, schedule: 'review', estSec: KIND_SECONDS[q.kind] };
      state = { ...state, plan: { ...state.plan, items: [...state.plan.items, extra] } };
      await db.session.put(state);
    }
    setResult({ g, cause: out.cause, wrongId: out.wrongId, xp: out.xp });
    // 다음 항목으로 넘어가기 전까지 현재 화면 유지
    pendingRef.current = state;
    setBusy(false);
  };

  const onNext = () => {
    if (pendingRef.current) setSt(pendingRef.current);
    pendingRef.current = null;
  };

  const exit = () => {
    if (confirm('학습을 잠시 멈출까요? 홈에서 이어서 할 수 있어요.')) go('');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="safe-top sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-bg px-4 pb-3">
        <button onClick={exit} aria-label="그만하기" className="-ml-1 p-1 text-muted">
          <Icon name="x" size={26} />
        </button>
        <Progress value={(st.index + (result ? 1 : 0)) / total} h="h-3" />
        <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-xp">
          <Icon name="star" fill size={16} />
          {st.xp}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Chip tone="brand">{item.type === 'intro' ? '새로운 개념' : KIND_LABEL[item.q!.kind]}</Chip>
        {item.recheck && <Chip>10분 뒤 다시 확인</Chip>}
        {item.bucket === 'weak' && <Chip tone="warn">보충</Chip>}
        {c.status === 'ai_draft' && <Chip tone="muted">검증 대기 콘텐츠</Chip>}
      </div>

      <div className="flex-1 pb-48">
        {item.type === 'intro' ? (
          <div className="anim-pop">
            <div className="text-xs font-semibold text-muted">오늘 배울 내용</div>
            <h1 className="mt-1 text-3xl font-black">{c.name}</h1>
            <div className="mt-3">
              <ConceptBody c={c} compact />
            </div>
          </div>
        ) : (
          <QuestionView q={item.q!} revealed={result?.g ?? null} onChange={setResp} />
        )}
      </div>

      {/* 하단 고정 영역(한 손 조작) */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-xl">
          {item.type === 'intro' ? (
            <div className="bg-bg/95 p-4 backdrop-blur">
              <Button big className="w-full" onClick={onIntroDone} disabled={busy}>
                이해했어요, 문제 풀기
              </Button>
            </div>
          ) : !result ? (
            <div className="space-y-2 bg-bg/95 p-4 backdrop-blur">
              <button onClick={() => setUnsure(!unsure)} className={cx('w-full rounded-xl border-2 py-2 text-sm font-semibold', unsure ? 'border-warn bg-warn2 text-warn' : 'border-line text-muted')}>
                {unsure ? '✓ 확실하지 않아요(찍었어요)' : '확실하지 않으면 눌러 주세요'}
              </button>
              <Button big className="w-full" onClick={onCheck} disabled={!resp || busy}>
                확인
              </Button>
            </div>
          ) : (
            <div className={cx('anim-up rounded-t-3xl p-4', result.g.correct ? 'bg-ok2' : 'bg-bad2')}>
              <div className={cx('flex items-center gap-2 text-xl font-black', result.g.correct ? 'text-ok' : 'text-bad')}>
                <Icon name={result.g.correct ? 'check' : 'x'} size={26} />
                {result.g.correct ? (unsure ? '맞았어요! 다음엔 확신을 가져요' : '정답이에요!') : '아쉬워요'}
                <span className="ml-auto text-sm text-xp">+{result.xp} XP</span>
              </div>
              {!result.g.correct && item.q!.kind !== 'match' && item.q!.kind !== 'sort2' && (
                <div className="mt-1 text-[15px] font-semibold">정답: {result.g.correctAnswer}</div>
              )}
              <div className="mt-2 max-h-40 overflow-y-auto text-[14px] leading-6 whitespace-pre-line text-ink">{item.q!.explanation}</div>
              {!result.g.correct && result.cause && (
                <div className="mt-2">
                  <div className="text-xs text-muted">
                    추정 원인: <b>{CAUSE_LABEL[userCause ?? result.cause]}</b>
                    {askCause && ' · 다르면 골라 주세요(선택)'}
                  </div>
                  {askCause && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {USER_CAUSES.map((k) => (
                        <button
                          key={k}
                          onClick={() => {
                            setUC(k);
                            if (result.wrongId) setUserCause(result.wrongId, k);
                          }}
                          className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold', (userCause ?? result.cause) === k ? 'border-bad bg-card text-bad' : 'border-line bg-card/60 text-muted')}
                        >
                          {CAUSE_LABEL[k]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                <Button variant="outline" onClick={() => setShowConcept(true)}>
                  <Icon name="book" size={18} /> 개념
                </Button>
                <Button big variant={result.g.correct ? 'ok' : 'bad'} onClick={onNext}>
                  계속
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Sheet open={showConcept} onClose={() => setShowConcept(false)} title={c.name}>
        <ConceptBody c={c} />
      </Sheet>
    </div>
  );
}

function Complete({ done, onNext }: { done: { xp: number; acc: number; ms: number; n: number }; onNext: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center text-center">
      <Confetti show />
      <div className="anim-pop text-6xl">🎉</div>
      <h1 className="anim-pop mt-3 text-3xl font-black">세션 완료!</h1>
      <div className="mt-6 grid w-full grid-cols-3 gap-2">
        <div className="rounded-2xl border border-line bg-card p-3">
          <div className="text-xs text-muted">경험치</div>
          <div className="text-xl font-black text-xp">+{done.xp}</div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-3">
          <div className="text-xs text-muted">정답률</div>
          <div className="text-xl font-black text-ok">{Math.round(done.acc * 100)}%</div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-3">
          <div className="text-xs text-muted">실제 학습</div>
          <div className="text-xl font-black">{fmtMin(done.ms / 1000) === '0분' ? '1분 미만' : fmtMin(done.ms / 1000)}</div>
        </div>
      </div>
      <div className="mt-8 grid w-full gap-2">
        <Button
          big
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onNext();
          }}
        >
          다음 세션 계속하기
        </Button>
        <Button variant="ghost" onClick={() => go('')}>
          홈으로
        </Button>
      </div>
    </div>
  );
}
