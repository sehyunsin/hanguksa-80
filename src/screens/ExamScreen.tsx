import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { CONCEPT_MAP, ERA_LABEL } from '../content';
import { examTags, officialKey } from '../content/exams';
import { DEFAULT_EVAL_ROUNDS, EXAM_FORMAT, OFFICIAL_ARCHIVE_URL, OFFICIAL_ROUNDS } from '../content/official';
import { db } from '../db/db';
import { startSession } from '../db/repo';
import { generateMockExam, gradeLabel, parseAnswerKeyText, readiness, validateKey } from '../engine/exam';
import type { AnswerKeyItem, ExamResult } from '../engine/model';
import { STAGE_TARGETS, requiredCoverage, scaleDay } from '../engine/planner';
import { mulberry32 } from '../engine/util';
import { usePlan } from '../ui/hooks';
import { Button, Card, Chip, Empty, Header, Icon, Section, Sheet, cx } from '../ui/kit';
import { pdfText } from '../ui/pdf';
import { back, go } from '../ui/router';

const LIMIT = EXAM_FORMAT.minutes * 60;

export default function ExamScreen({ resultId }: { resultId?: number }) {
  const data = usePlan();
  const exams = useLiveQuery(() => db.exams.orderBy('ts').toArray(), []);
  const papers = useLiveQuery(() => db.papers.toArray(), []);
  const mock = useLiveQuery(() => db.mock.get('mock'), []);
  const [importRound, setImportRound] = useState<number | null>(null);
  if (!data || !exams || !papers) return null;
  if (resultId) return <ResultView id={resultId} />;
  const { mastery, plan } = data;
  const cov = requiredCoverage(mastery);
  const rd = readiness(exams, cov.complete);
  const paperMap = new Map(papers.map((p) => [p.round, p]));
  const officials = exams.filter((e) => e.kind === 'official');
  const takenRounds = new Set(officials.map((e) => e.round));

  const startGenerated = async () => {
    const known = new Set([...mastery.values()].filter((m) => m.level > 0).map((m) => m.conceptId));
    const qs = generateMockExam(mulberry32(Date.now() >>> 0), known.size >= 60 ? known : undefined);
    await db.mock.put({ id: 'mock', kind: 'generated', title: `창작 모의고사 ${new Date().toLocaleDateString('ko-KR')}`, questions: qs, answers: Array(50).fill(null), startedAt: Date.now(), limitSec: LIMIT, isEvaluation: false });
    go('exam/run');
  };
  const startOfficial = async (round: number) => {
    const p = paperMap.get(round)!;
    if (p.evaluationOnly && takenRounds.has(round) && !confirm('이 회차는 이미 평가로 응시했어요. 다시 풀면 연습 기록으로만 저장됩니다. 계속할까요?')) return;
    await db.mock.put({ id: 'mock', kind: 'official', round, title: `제${round}회 심화`, answers: Array(50).fill(null), startedAt: Date.now(), limitSec: LIMIT, isEvaluation: p.evaluationOnly && !takenRounds.has(round) });
    go('exam/run');
  };

  const targets = STAGE_TARGETS.map((t) => ({ ...t, day: scaleDay(t.day, 79, plan.totalDays) }));

  return (
    <div>
      <Header title="실전 시험" />
      {mock && (
        <Card className="mb-3 border-brand/40 bg-brand2" onClick={() => go('exam/run')}>
          <div className="font-bold text-brand">진행 중인 시험이 있어요: {mock.title}</div>
          <div className="text-sm">눌러서 이어서 풀기 (시간은 계속 흐르고 있어요)</div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div className="font-extrabold">최종 준비 완료 기준</div>
          {rd.ready ? <Chip tone="ok">달성</Chip> : <Chip>진행 중</Chip>}
        </div>
        <ul className="mt-2 space-y-1.5 text-sm">
          {rd.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.ok ? 'bg-ok text-white' : 'bg-card2 text-muted')}>{c.ok && <Icon name="check" size={14} />}</span>
              <span className={c.ok ? '' : 'text-muted'}>{c.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">검증되지 않은 합격 확률은 표시하지 않아요. 실제 기출 점수로만 판단합니다.</p>
      </Card>

      <Section title="단계별 목표 점수">
        <Card>
          <div className="grid grid-cols-6 gap-1 text-center">
            {targets.map((t) => {
              const reached = t.day <= plan.dayIndex;
              const best = officials.concat(exams.filter((e) => e.kind === 'generated')).filter((e) => e.score >= t.score).length > 0;
              return (
                <div key={t.day} className={cx('rounded-xl p-1.5', t.day === plan.dayIndex ? 'bg-brand2' : '')}>
                  <div className="text-[11px] text-muted">{t.day}일차</div>
                  <div className={cx('text-lg font-black tabular-nums', reached && best ? 'text-ok' : reached ? 'text-bad' : '')}>{t.score}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </Section>

      <Section title="창작 문항 모의고사">
        <Card>
          <div className="text-sm">앱 콘텐츠로 만든 50문항·80분·100점(1~3점) 연습 시험입니다. <b>실제 기출이 아니며</b>, 성적은 실제 기출 성적과 따로 저장돼요.</div>
          <Button className="mt-3 w-full" onClick={startGenerated}>
            창작 모의고사 시작
          </Button>
        </Card>
      </Section>

      <Section title="실제 기출 회차">
        <Card className="mb-2">
          <div className="text-sm leading-6">
            국사편찬위원회 <b>시험 자료실</b>에서 <b>문제지 PDF</b>를 직접 내려받아 등록하세요. 정답·배점은 공식 정답표에서 읽어 앱에 들어 있어 자동으로 채워져요. 문제지 파일은 이 기기 안에만 저장되고 외부로 보내지 않아요. 최근 5개 회차({DEFAULT_EVAL_ROUNDS.join('·')}회)는 기본으로 <b>실전 평가 전용</b>이라, 첫 응시 전에는 학습 과정에서 쓰지 않습니다.
          </div>
          <Button variant="outline" className="mt-2 w-full" onClick={() => window.open(OFFICIAL_ARCHIVE_URL, '_blank', 'noopener')}>
            <Icon name="link" size={18} /> 공식 시험 자료실 열기
          </Button>
        </Card>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {OFFICIAL_ROUNDS.map((r) => {
            const p = paperMap.get(r.round);
            const res = officials.filter((e) => e.round === r.round);
            const last = res[res.length - 1];
            return (
              <div key={r.round} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    제{r.round}회
                    {p?.evaluationOnly && <Chip tone="warn">평가 전용</Chip>}
                  </div>
                  <div className="text-xs text-muted">
                    자료실 게시 {r.date}
                    {p ? ' · 문제지 등록됨' : ' · 문제지 미등록'}
                    {officialKey(r.round) ? ' · 정답 내장' : ''}
                    {last && ` · 최근 ${last.score}점`}
                  </div>
                </div>
                {p ? (
                  <div className="flex gap-1.5">
                    <Button variant="ghost" onClick={() => setImportRound(r.round)}>
                      편집
                    </Button>
                    <Button onClick={() => startOfficial(r.round)}>응시</Button>
                  </div>
                ) : (
                  <Button variant="soft" onClick={() => setImportRound(r.round)}>
                    등록
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-muted">공식 자료실 목록 기준 제57~80회(2022.2~2026.10). 그 이전 회차는 공식 자료실에 없어 미확보입니다.</p>
      </Section>

      <Section title="시험 기록">
        {exams.length === 0 ? <Empty>아직 응시 기록이 없어요.</Empty> : <ScoreChart exams={exams} />}
        <div className="mt-2 space-y-2">
          {exams
            .slice()
            .reverse()
            .slice(0, 20)
            .map((e) => (
              <Card key={e.id} onClick={() => go(`exam/result/${e.id}`)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">{e.title}</div>
                    <div className="text-xs text-muted">
                      {e.day} · {e.kind === 'official' ? (e.isEvaluation ? '실제 기출 · 평가' : '실제 기출 · 연습') : '창작 문항'} · {Math.round(e.durationSec / 60)}분{!e.withinTime && ' · 시간 초과'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black tabular-nums">{e.score}</div>
                    <div className={cx('text-xs font-bold', e.score >= 60 ? 'text-ok' : 'text-bad')}>{gradeLabel(e.score)}</div>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      </Section>

      <ImportSheet round={importRound} onClose={() => setImportRound(null)} />
    </div>
  );
}

function ScoreChart({ exams }: { exams: ExamResult[] }) {
  const pts = exams.slice(-12);
  const w = 320;
  const h = 120;
  const x = (i: number) => (pts.length === 1 ? w / 2 : 16 + (i * (w - 32)) / (pts.length - 1));
  const y = (s: number) => h - 12 - (s / 100) * (h - 24);
  return (
    <Card>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="최근 시험 점수 변화">
        {[60, 70, 80].map((g) => (
          <g key={g}>
            <line x1={0} x2={w} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray="4 4" />
            <text x={w - 2} y={y(g) - 3} textAnchor="end" fontSize="9" fill="var(--muted)">
              {g === 60 ? '3급' : g === 70 ? '2급' : '1급'}
            </text>
          </g>
        ))}
        <polyline fill="none" stroke="var(--brand)" strokeWidth={2.5} points={pts.map((e, i) => `${x(i)},${y(e.score)}`).join(' ')} />
        {pts.map((e, i) => (
          <circle key={i} cx={x(i)} cy={y(e.score)} r={4} fill={e.kind === 'official' ? 'var(--brand)' : 'var(--card)'} stroke="var(--brand)" strokeWidth={2} />
        ))}
      </svg>
      <div className="mt-1 text-xs text-muted">● 실제 기출 ○ 창작 문항 · 최근 {pts.length}회</div>
    </Card>
  );
}

function ImportSheet({ round, onClose }: { round: number | null; onClose: () => void }) {
  const existing = useLiveQuery(() => (round ? db.papers.get(round) : undefined), [round]);
  const [qFile, setQFile] = useState<File | null>(null);
  const [key, setKey] = useState<AnswerKeyItem[] | null>(null);
  const [msg, setMsg] = useState('');
  const [evalOnly, setEvalOnly] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  if (round === null) return null;
  const builtIn = officialKey(round);
  const k: AnswerKeyItem[] = key ?? existing?.answerKey ?? builtIn ?? Array.from({ length: 50 }, () => ({ ans: 0, pts: 0 }));
  const ev = evalOnly ?? existing?.evaluationOnly ?? DEFAULT_EVAL_ROUNDS.includes(round);
  const errs = validateKey(k);

  const close = () => {
    setQFile(null);
    setKey(null);
    setMsg('');
    setEvalOnly(null);
    onClose();
  };
  const onAnswerPdf = async (f: File) => {
    setBusy(true);
    try {
      const text = await pdfText(await f.arrayBuffer());
      const r = parseAnswerKeyText(text);
      setKey(r.key);
      setMsg(r.confidence >= 0.99 ? '정답표를 읽었어요. 아래 내용이 정답표와 같은지 꼭 확인하세요.' : `일부만 읽었어요(신뢰도 ${Math.round(r.confidence * 100)}%). 비어 있거나 틀린 칸을 정답표를 보고 고쳐 주세요.`);
    } catch {
      setMsg('PDF에서 글자를 읽지 못했어요(이미지 PDF일 수 있음). 정답표를 보고 직접 입력해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!existing && !qFile) {
      setMsg('문제지 PDF를 선택해 주세요.');
      return;
    }
    setBusy(true);
    if (qFile) await db.paperFiles.put({ id: `${round}-q`, round, name: qFile.name, blob: qFile });
    await db.papers.put({
      round,
      title: `제${round}회 심화`,
      addedAt: existing?.addedAt ?? Date.now(),
      hasQuestionPdf: true,
      answerKey: k,
      evaluationOnly: ev,
    });
    setBusy(false);
    close();
  };
  const setCell = (i: number, patch: Partial<AnswerKeyItem>) => setKey(k.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Sheet open onClose={close} title={`제${round}회 심화 등록`}>
      <div className="space-y-4 text-sm">
        <label className="block">
          <div className="mb-1 font-bold">1. 문제지 PDF {existing?.hasQuestionPdf && <span className="font-normal text-ok">(등록됨 — 바꾸려면 다시 선택)</span>}</div>
          <input type="file" accept="application/pdf" onChange={(e) => setQFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 font-bold">2. 정답표(답지) PDF — 선택 사항{builtIn ? ' (공식 정답표가 이미 들어 있어요)' : ''}</div>
          <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && onAnswerPdf(e.target.files[0])} className="w-full text-sm" />
          {msg && <div className="mt-1 text-warn">{msg}</div>}
        </label>
        <div>
          <div className="mb-1 font-bold">3. 정답·배점 확인/입력</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {k.map((x, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                <select
                  value={x.all ? -1 : x.ans}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCell(i, v === -1 ? { ans: 0, all: true, accept: undefined } : { ans: v, all: undefined, accept: undefined });
                  }}
                  className={cx('rounded-lg border bg-card px-1 py-1', x.ans || x.all ? 'border-line' : 'border-bad')}
                >
                  <option value={0}>정답</option>
                  <option value={-1}>없음(전원)</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {'①②③④⑤'[n - 1]}
                    </option>
                  ))}
                </select>
                <select value={x.pts} onChange={(e) => setCell(i, { pts: Number(e.target.value) })} className={cx('rounded-lg border bg-card px-1 py-1', x.pts ? 'border-line' : 'border-bad')}>
                  <option value={0}>점</option>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}점
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className={cx('mt-2 text-xs', errs.length ? 'text-bad' : 'text-ok')}>{errs.length ? `${errs[0]}${errs.length > 1 ? ` 외 ${errs.length - 1}건` : ''} — 정답이 완성되지 않으면 채점은 나중에 할 수 있어요.` : '정답 50개·배점 합계 100점 확인 완료'}</div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ev} onChange={(e) => setEvalOnly(e.target.checked)} />
          <span>실전 평가 전용 회차로 지정(첫 응시 성적을 준비도 판정에 사용)</span>
        </label>
        <Button big className="w-full" onClick={save} disabled={busy}>
          저장
        </Button>
        {existing && (
          <Button
            variant="ghost"
            className="w-full text-bad"
            onClick={async () => {
              if (!confirm(`제${round}회 등록 정보와 문제지 파일을 이 기기에서 삭제할까요? 응시 기록은 남습니다.`)) return;
              await db.papers.delete(round);
              await db.paperFiles.delete(`${round}-q`);
              close();
            }}
          >
            이 회차 등록 삭제
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function ResultView({ id }: { id: number }) {
  const r = useLiveQuery(() => db.exams.get(id), [id]);
  if (!r) return null;
  const wrongIdx = r.correctness.map((ok, i) => (ok ? -1 : i)).filter((i) => i >= 0);
  // 문항별 개념: 창작 모의고사는 저장된 개념, 실제 기출은 자동 분석 태그(주 개념 → 정답 선지 개념 순)
  const tags = r.kind === 'official' && r.round ? examTags(r.round) : undefined;
  const conceptIds: (string | null)[] =
    r.conceptIds ?? (tags ? tags.map((t) => (t.confidence !== 'none' ? (t.primary ?? t.correct) : t.correct)) : []);
  const wrongConcepts = [...new Set(wrongIdx.map((i) => conceptIds[i]).filter((x): x is string => !!x))];
  const eraStat = new Map<string, { ok: number; n: number }>();
  if (conceptIds.length)
    conceptIds.forEach((cid, i) => {
      if (!cid) return;
      const era = CONCEPT_MAP.get(cid)?.era ?? 'theme';
      const cur = eraStat.get(era) ?? { ok: 0, n: 0 };
      cur.n++;
      if (r.correctness[i]) cur.ok++;
      eraStat.set(era, cur);
    });
  return (
    <div>
      <Header title="시험 결과" onBack={() => back('exam')} />
      <Card className="text-center">
        <div className="text-sm text-muted">{r.title}</div>
        <div className="mt-1 text-6xl font-black tabular-nums">{r.score}</div>
        <div className={cx('text-lg font-extrabold', r.score >= 60 ? 'text-ok' : 'text-bad')}>{gradeLabel(r.score)}</div>
        <div className="mt-2 text-sm text-muted">
          {r.correctCount}/{r.total}문항 · {Math.floor(r.durationSec / 60)}분 {r.durationSec % 60}초 {r.withinTime ? '· 시간 내 완료' : '· 시간 초과'}
          {r.kind === 'generated' && ' · 창작 문항(실제 기출 아님)'}
        </div>
      </Card>
      <Section title={`틀린 문항 ${wrongIdx.length}`}>
        <div className="flex flex-wrap gap-1.5">
          {wrongIdx.map((i) => {
            const cid = conceptIds[i];
            return (
              <button
                key={i}
                onClick={() => cid && go(`concept/${cid}`)}
                className="rounded-lg bg-bad2 px-2 py-1 text-left text-sm font-bold text-bad tabular-nums"
              >
                {i + 1}번{r.points ? `(${r.points[i]}점)` : ''}
                {cid && <span className="block text-[11px] font-semibold text-ink/70">{CONCEPT_MAP.get(cid)?.name}</span>}
              </button>
            );
          })}
          {wrongIdx.length === 0 && <Empty>모두 맞혔어요!</Empty>}
        </div>
      </Section>
      {eraStat.size > 0 && (
        <Section title="시대별 정답률">
          <Card>
            <ul className="space-y-1 text-sm">
              {[...eraStat.entries()].map(([era, s]) => (
                <li key={era} className="flex justify-between">
                  <span>{ERA_LABEL[era as keyof typeof ERA_LABEL]}</span>
                  <span className={cx('tabular-nums', s.ok / s.n < 0.6 ? 'text-bad' : '')}>
                    {s.ok}/{s.n}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
      {wrongConcepts.length > 0 && (
        <Button big className="mt-4 w-full" onClick={async () => (await startSession('concept', { conceptIds: wrongConcepts.slice(0, 6), withIntro: true }), go('learn'))}>
          틀린 개념 바로 복습({Math.min(6, wrongConcepts.length)}개)
        </Button>
      )}
      {r.kind === 'official' && (
        <p className="mt-4 text-xs text-muted">
          {tags
            ? '문항별 개념은 기출 자동 분석(키워드 매칭) 결과라 일부 틀릴 수 있어요. 개념 이름이 없는 문항은 분석이 보류된 문항입니다. 문제지에서 다시 확인하세요.'
            : '이 회차는 자동 분석 데이터가 없어 개념 연결 없이 점수만 표시합니다.'}
        </p>
      )}
    </div>
  );
}
