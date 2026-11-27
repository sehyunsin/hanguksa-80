import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { officialKey } from '../content/exams';
import { db, type MockState } from '../db/db';
import { saveExamResult } from '../db/repo';
import { mockAnswerIndex, scoreAnswers, validateKey } from '../engine/exam';
import type { AnswerKeyItem } from '../engine/model';
import { dayKey } from '../engine/util';
import { Button, Icon, Sheet, cx } from '../ui/kit';
import { Passage } from '../ui/QuestionView';
import { openPdf } from '../ui/pdf';
import { go } from '../ui/router';

const NUM = ['①', '②', '③', '④', '⑤'];

export default function ExamRunner() {
  const mock = useLiveQuery(async () => (await db.mock.get('mock')) ?? null, []);
  const [now, setNow] = useState(Date.now());
  const [omr, setOmr] = useState(false);
  const [cur, setCur] = useState(0);
  const submitted = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = mock ? mock.limitSec - Math.floor((now - mock.startedAt) / 1000) : 0;
  useEffect(() => {
    if (mock && remaining <= 0 && !submitted.current) {
      alert('시험 시간이 끝났어요. 지금까지의 답안으로 제출합니다.');
      submit(mock);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining <= 0, mock?.startedAt]);

  if (mock === undefined) return <div className="p-8 text-center text-muted">불러오는 중…</div>;
  if (mock === null) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted">진행 중인 시험이 없어요.</p>
        <Button className="mt-4" onClick={() => go('exam')}>
          실전 시험으로
        </Button>
      </div>
    );
  }

  const setAnswer = async (i: number, a: number) => {
    const answers = mock.answers.slice();
    answers[i] = answers[i] === a ? null : a;
    await db.mock.put({ ...mock, answers });
  };

  async function submit(m: MockState) {
    if (submitted.current) return;
    submitted.current = true;
    const elapsed = Math.floor((Date.now() - m.startedAt) / 1000);
    let key: AnswerKeyItem[] | undefined;
    if (m.kind === 'generated') key = m.questions!.map((x) => ({ ans: mockAnswerIndex(x.q), pts: x.pts }));
    else {
      const p = await db.papers.get(m.round!);
      if (p?.answerKey && validateKey(p.answerKey).length === 0) key = p.answerKey;
      else key = officialKey(m.round!);
    }
    if (!key) {
      alert('이 회차의 정답이 아직 완성되지 않아 채점할 수 없어요. 답안은 그대로 보관합니다. 실전 시험 > 회차 편집에서 정답을 입력한 뒤 다시 제출하세요.');
      submitted.current = false;
      go('exam');
      return;
    }
    const s = scoreAnswers(key, m.answers);
    const id = await saveExamResult({
      ts: Date.now(),
      day: dayKey(),
      kind: m.kind,
      round: m.round,
      title: m.title,
      score: s.score,
      maxScore: s.maxScore,
      correctCount: s.correctCount,
      total: key.length,
      durationSec: Math.min(elapsed, m.limitSec + 5),
      limitSec: m.limitSec,
      withinTime: elapsed <= m.limitSec + 5,
      answers: m.answers,
      correctness: s.correctness,
      isEvaluation: m.isEvaluation,
      conceptIds: m.questions?.map((x) => x.q.conceptId),
      points: key.map((k) => k.pts),
    });
    await db.mock.delete('mock');
    go(`exam/result/${id}`);
  }

  const answered = mock.answers.filter((a) => a !== null).length;
  const mm = Math.max(0, Math.floor(remaining / 60));
  const ss = Math.max(0, remaining % 60);

  return (
    <div className="pb-40">
      <div className="safe-top sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-line bg-bg/95 px-4 pb-2 backdrop-blur">
        <button
          onClick={() => {
            if (confirm('시험을 잠시 나갈까요? 시간은 계속 흐릅니다.')) go('exam');
          }}
          className="p-1 text-muted"
          aria-label="나가기"
        >
          <Icon name="x" size={24} />
        </button>
        <div className="min-w-0 flex-1 truncate font-bold">{mock.title}</div>
        <div className={cx('flex items-center gap-1 font-black tabular-nums', remaining < 600 ? 'text-bad' : '')}>
          <Icon name="clock" size={18} />
          {mm}:{String(ss).padStart(2, '0')}
        </div>
      </div>

      {mock.kind === 'generated' ? (
        <GeneratedPaper mock={mock} cur={cur} setCur={setCur} setAnswer={setAnswer} />
      ) : (
        <OfficialPaper round={mock.round!} />
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-xl p-3">
          {mock.kind === 'official' && (
            <div className="mb-2 flex items-center gap-2">
              <button onClick={() => setCur(Math.max(0, cur - 1))} className="rounded-xl border border-line px-3 py-2 font-bold" aria-label="이전 문항">
                ‹
              </button>
              <div className="w-12 text-center font-black tabular-nums">{cur + 1}번</div>
              <div className="flex flex-1 justify-between">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAnswer(cur, n).then(() => cur < 49 && setTimeout(() => setCur(cur + 1), 150))}
                    className={cx('h-11 w-11 rounded-full border-2 text-lg font-bold', mock.answers[cur] === n ? 'border-brand bg-brand text-brandink' : 'border-line')}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button onClick={() => setCur(Math.min(49, cur + 1))} className="rounded-xl border border-line px-3 py-2 font-bold" aria-label="다음 문항">
                ›
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setOmr(true)}>
              답안지 ({answered}/50)
            </Button>
            <Button
              onClick={() => {
                if (confirm(answered < 50 ? `${50 - answered}문항이 비어 있어요. 제출할까요?` : '제출할까요?')) submit(mock);
              }}
            >
              제출
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={omr} onClose={() => setOmr(false)} title="답안지(OMR)">
        <div className="grid grid-cols-1 gap-1">
          {mock.answers.map((a, i) => (
            <div key={i} className={cx('flex items-center gap-2 rounded-lg px-1 py-0.5', i === cur && 'bg-brand2')}>
              <button className="w-8 text-right text-sm font-bold tabular-nums text-muted" onClick={() => (setCur(i), setOmr(false))}>
                {i + 1}
              </button>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setAnswer(i, n)} className={cx('h-8 w-8 rounded-full border text-sm font-bold', a === n ? 'border-ink bg-ink text-bg' : 'border-line')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function GeneratedPaper({ mock, cur, setCur, setAnswer }: { mock: MockState; cur: number; setCur: (n: number) => void; setAnswer: (i: number, a: number) => Promise<void> }) {
  const item = mock.questions![cur];
  const q = item.q;
  return (
    <div className="pt-3">
      <div className="mb-2 flex items-center justify-between text-sm text-muted">
        <span>
          {cur + 1}/50 · [{item.pts}점]
        </span>
        <span>창작 문항(실제 기출 아님)</span>
      </div>
      <h2 className="text-[18px] leading-7 font-extrabold">
        {cur + 1}. {q.prompt}
      </h2>
      <Passage q={q} />
      <div className="mt-4 space-y-2">
        {q.choices!.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setAnswer(cur, i + 1)}
            className={cx('flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[16px] leading-6', mock.answers[cur] === i + 1 ? 'border-brand bg-brand2' : 'border-line bg-card')}
          >
            <span className="font-bold text-muted">{NUM[i]}</span>
            <span>{c.text}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setCur(Math.max(0, cur - 1))} disabled={cur === 0}>
          이전
        </Button>
        <Button variant="soft" onClick={() => setCur(Math.min(49, cur + 1))} disabled={cur === 49}>
          다음
        </Button>
      </div>
    </div>
  );
}

function OfficialPaper({ round }: { round: number }) {
  const file = useLiveQuery(() => db.paperFiles.get(`${round}-q`), [round]);
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  const [pages, setPages] = useState(0);

  useEffect(() => {
    if (!file || !ref.current) return;
    let cancelled = false;
    const host = ref.current;
    host.innerHTML = '';
    (async () => {
      try {
        const doc = await openPdf(await file.blob.arrayBuffer());
        if (cancelled) return;
        setPages(doc.numPages);
        const width = host.clientWidth || 360;
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = '100%';
          canvas.className = 'mb-2 rounded-lg bg-white shadow';
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise;
        }
      } catch (e) {
        setErr('문제지 PDF를 열 수 없어요. 파일을 다시 등록해 주세요.');
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (file === undefined) return <div className="p-6 text-center text-muted">문제지를 불러오는 중…</div>;
  if (!file) return <div className="p-6 text-center text-bad">이 회차의 문제지 PDF가 등록되어 있지 않아요.</div>;
  return (
    <div className="pt-3">
      {err && <div className="mb-2 text-bad">{err}</div>}
      {pages > 0 && <div className="mb-2 text-xs text-muted">{pages}쪽 · 아래 답안 입력줄에서 번호를 고르세요(다시 누르면 지워짐)</div>}
      <div ref={ref} className="-mx-2" />
    </div>
  );
}
