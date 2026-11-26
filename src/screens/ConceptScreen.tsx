import { useLiveQuery } from 'dexie-react-hooks';
import { CONCEPT_MAP, ERA_LABEL, UNIT_MAP, VERIFICATION } from '../content';
import { ANALYZED_ROUNDS, frequencyOf } from '../content/exams';
import type { Concept } from '../content/types';
import { db } from '../db/db';
import { startSession } from '../db/repo';
import { CAUSE_LABEL } from '../engine/model';
import { retrievability } from '../engine/srs';
import { Button, Card, Chip, Header, Icon, LevelDots, Section, pct } from '../ui/kit';
import { back, go } from '../ui/router';

const LEVEL_TEXT = ['미학습', '소개됨', '쉬운 확인 통과', '회상·비교 통과', '간격 후 기출형 통과', '장기 기억'];

export function FreqChip({ id }: { id: string }) {
  const f = frequencyOf(id);
  return (
    <Chip tone={f.level === '상' ? 'bad' : f.level === '중' ? 'warn' : 'muted'}>
      기출 {f.rounds}/{ANALYZED_ROUNDS}회
    </Chip>
  );
}

export function ConceptBody({ c, compact }: { c: Concept; compact?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="brand">{ERA_LABEL[c.era]}</Chip>
        {c.when && <Chip>{c.when}</Chip>}
        {!compact && <FreqChip id={c.id} />}
        {c.status === 'verified' ? <Chip tone="ok">출처 대조 완료</Chip> : c.status === 'partial' ? <Chip tone="brand">일부 출처 확인</Chip> : <Chip tone="warn">검증 대기</Chip>}
      </div>
      <p className="mt-3 text-[15px] font-semibold text-brand">{c.summary}</p>
      <div className="mt-2 space-y-2 text-[16px] leading-7">
        {c.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-brand2 p-3">
        <div className="mb-1 text-xs font-bold text-brand">핵심 기억</div>
        <ul className="flex flex-wrap gap-1.5">
          {c.keys.map((k) => (
            <li key={k} className="rounded-xl bg-card px-2.5 py-1 text-sm font-semibold">
              {k}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ConceptScreen({ id }: { id?: string }) {
  const c = id ? CONCEPT_MAP.get(id) : undefined;
  const m = useLiveQuery(() => (id ? db.mastery.get(id) : undefined), [id]);
  const wrongs = useLiveQuery(() => (id ? db.wrongs.where('conceptId').equals(id).reverse().sortBy('ts') : []), [id]);
  if (!c) return <div className="p-8 text-center text-muted">개념을 찾을 수 없어요.</div>;
  const unit = UNIT_MAP.get(c.unitId)!;
  const now = Date.now();

  return (
    <div>
      <Header title={c.name} onBack={() => back('map')} />
      <div className="mb-3 text-xs text-muted">
        UNIT {unit.no}. {unit.title}
      </div>
      <Card>
        <ConceptBody c={c} />
      </Card>

      <Section title="실제 기출 출제 현황">
        <Card className="text-sm leading-6">
          {(() => {
            const f = frequencyOf(c.id);
            return f.rounds ? (
              <>
                최근 심화 {ANALYZED_ROUNDS}개 회차(제57~80회) 중 <b>{f.rounds}개 회차</b>에서 관련 문항이 나왔어요(관련 문항 약 {f.questions}개, 정답·자료·오답 선지 포함).
              </>
            ) : (
              <>최근 {ANALYZED_ROUNDS}개 회차 자동 분석에서 이 개념과 연결된 문항을 찾지 못했어요.</>
            );
          })()}
          <div className="mt-1 text-xs text-muted">공식 기출 PDF를 키워드로 자동 분석한 추정치예요(표본 검수 기준 단원 일치 약 90%, 개념 일치 약 75~85%).</div>
        </Card>
      </Section>

      <Section title="이 개념에서 출제되는 내용">
        <Card>
          <ul className="list-disc space-y-1.5 pl-5 text-[15px]">
            {c.facts.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
          {c.clues.length > 0 && (
            <div className="mt-3 space-y-2">
              {c.clues.map((cl, i) => (
                <blockquote key={i} className="rounded-xl border-l-4 border-brand bg-card2 p-3 text-sm leading-6">
                  {cl.replace(/\{f:[\d,]+\}\s*$/, '').replace(/\(가\)/g, c.name)}
                </blockquote>
              ))}
              <div className="text-[11px] text-muted">※ 자료는 사료의 요지를 쉬운 말로 풀어 쓴 것입니다(원문 인용 아님).</div>
            </div>
          )}
        </Card>
      </Section>

      {c.confusers.length > 0 && (
        <Section title="헷갈리기 쉬운 개념">
          <div className="flex flex-wrap gap-2">
            {c.confusers.map((cid) => {
              const o = CONCEPT_MAP.get(cid)!;
              return (
                <button key={cid} onClick={() => go(`concept/${cid}`)} className="rounded-xl border border-line bg-card px-3 py-1.5 text-sm font-semibold">
                  {o.name}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="나의 학습 상태">
        <Card>
          <div className="flex items-center justify-between">
            <span className="font-bold">{LEVEL_TEXT[m?.level ?? 0]}</span>
            <LevelDots level={m?.level ?? 0} />
          </div>
          {m && m.level > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm text-muted">
              <span>정답 {m.correct} · 오답 {m.wrong}</span>
              <span>연속 정답 {m.streak}</span>
              <span>기억 유지 추정 {pct(retrievability(m, now))}</span>
              <span>다음 복습 {new Date(m.due).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
              <span>평균 응답 {(m.avgMs / 1000).toFixed(1)}초</span>
              <span>확신 오답 {m.confidentWrong}회</span>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={async () => (await startSession('concept', { conceptIds: [c.id] }), go('learn'))}>{m?.level ? '이 개념 연습' : '이 개념 배우기'}</Button>
            <Button variant="outline" onClick={() => window.open(c.refs[0].url, '_blank', 'noopener')}>
              <Icon name="link" size={18} /> 출처 확인
            </Button>
          </div>
        </Card>
      </Section>

      {wrongs && wrongs.length > 0 && (
        <Section title={`오답 기록 ${wrongs.length}`}>
          <div className="space-y-2">
            {wrongs.slice(0, 6).map((w) => (
              <Card key={w.id} className="text-sm">
                <div className="flex justify-between">
                  <Chip tone="bad">{CAUSE_LABEL[w.userCause ?? w.cause]}</Chip>
                  <span className="text-xs text-muted">{w.day}</span>
                </div>
                <div className="mt-1 text-muted">내 답: {w.userAnswer || '-'}</div>
                <div>정답: {w.correctAnswer}</div>
              </Card>
            ))}
          </div>
        </Section>
      )}
      <Section title="출처와 검증">
        <Card className="text-sm leading-6">
          {c.status === 'ai_draft' && <p>AI가 작성한 초안으로, 아직 출처와 대조하지 못했어요.</p>}
          {c.status !== 'ai_draft' && VERIFICATION[c.id] && (
            <>
              <p>
                {c.status === 'verified' ? '모든 사실과 연도를 아래 항목 본문과 대조했어요.' : '아래 사실은 출처 본문에서 근거를 아직 찾지 못했어요(틀렸다는 뜻은 아니에요).'} (대조일 {VERIFICATION[c.id].checkedAt})
              </p>
              <p className="mt-1 text-xs text-muted">
                사실 {c.facts.length}개 중 사람이 출처를 읽고 확인 {Object.values(VERIFICATION[c.id].facts).filter((v) => v === 'manual').length}개 · 자동 확인(같은 문장 근처 일치){' '}
                {Object.values(VERIFICATION[c.id].facts).filter((v) => v === 'auto' || v === 'term').length}개
              </p>
              {Object.entries(VERIFICATION[c.id].facts).some(([, v]) => v === 'unconfirmed') && (
                <ul className="mt-1 list-disc pl-5 text-warn">
                  {c.facts
                    .filter((f) => VERIFICATION[c.id].facts[f.id] === 'unconfirmed')
                    .map((f) => (
                      <li key={f.id}>{f.text}</li>
                    ))}
                </ul>
              )}
              {VERIFICATION[c.id].note && <p className="mt-1 text-xs text-muted">메모: {VERIFICATION[c.id].note}</p>}
            </>
          )}
          <ul className="mt-2 space-y-1">
            {c.refs.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            [출처 : 항목명 - 한국민족문화대백과사전](공공누리) · 우리역사넷(국사편찬위원회)의 신편 한국사·역대 국사교과서 등. 사실 대조에만 사용했으며 본문을 옮겨 싣지 않았어요.
          </p>
        </Card>
      </Section>
    </div>
  );
}
