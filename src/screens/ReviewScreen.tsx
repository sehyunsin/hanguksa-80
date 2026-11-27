import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { CONCEPT_MAP } from '../content';
import { db } from '../db/db';
import { startSession } from '../db/repo';
import { CAUSE_LABEL, type WrongCause } from '../engine/model';
import { KIND_LABEL } from '../engine/questions';
import { isScheduled, retrievability } from '../engine/srs';
import { useMastery } from '../ui/hooks';
import { Button, Card, Chip, Empty, Header, Section, cx } from '../ui/kit';
import { go } from '../ui/router';

export default function ReviewScreen({ tab }: { tab?: string }) {
  const mastery = useMastery();
  const wrongs = useLiveQuery(() => db.wrongs.orderBy('ts').reverse().toArray(), []);
  const confusions = useLiveQuery(() => db.confusions.orderBy('count').reverse().toArray(), []);
  const [filter, setFilter] = useState<WrongCause | 'all'>('all');
  if (!mastery || !wrongs || !confusions) return null;
  const now = Date.now();
  const intro = [...mastery.values()].filter((m) => m.level > 0);
  const due = intro.filter((m) => m.due <= now);
  const lowR = intro.filter((m) => isScheduled(m) && retrievability(m, now) < 0.8).length;
  const activeConf = confusions.filter((c) => c.count > c.resolvedCount);

  const byCause = new Map<WrongCause, number>();
  for (const w of wrongs) byCause.set(w.userCause ?? w.cause, (byCause.get(w.userCause ?? w.cause) ?? 0) + 1);
  const list = wrongs.filter((w) => filter === 'all' || (w.userCause ?? w.cause) === filter);

  const run = async (mode: 'review' | 'weak' | 'apply') => {
    await startSession(mode);
    go('learn');
  };

  return (
    <div>
      <Header title="복습" />
      {tab !== 'wrongs' && (
        <>
          <Card>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm text-muted">지금 복습할 개념</div>
                <div className="text-4xl font-black text-brand tabular-nums">{due.length}</div>
              </div>
              <div className="text-right text-xs text-muted">
                학습한 개념 {intro.length}개
                <br />
                기억 유지 80% 미만 {lowR}개
              </div>
            </div>
            <Button big className="mt-3 w-full" onClick={() => run('review')} disabled={!intro.length}>
              복습 시작
            </Button>
            <p className="mt-2 text-xs text-muted">복습은 언제든 할 수 있어요. 예정된 개념이 없으면 기억이 가장 흐려진 개념부터 출제합니다.</p>
          </Card>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => run('weak')} disabled={!intro.length}>
              취약 개념 집중
            </Button>
            <Button variant="outline" onClick={() => run('apply')} disabled={!intro.length}>
              기출 유형 집중
            </Button>
          </div>

          <Section title={`헷갈리는 짝 ${activeConf.length}`}>
            {activeConf.length === 0 ? (
              <Empty>아직 헷갈린 개념 짝이 없어요. 오답에서 다른 개념을 고르면 자동으로 기록돼요.</Empty>
            ) : (
              <div className="space-y-2">
                {activeConf.slice(0, 12).map((p) => {
                  const a = CONCEPT_MAP.get(p.a);
                  const b = CONCEPT_MAP.get(p.b);
                  if (!a || !b) return null;
                  return (
                    <Card key={p.pair} onClick={async () => (await startSession('concept', { conceptIds: [a.id, b.id] }), go('learn'))}>
                      <div className="flex items-center justify-between">
                        <div className="font-bold">
                          {a.name} <span className="text-muted">vs</span> {b.name}
                        </div>
                        <Chip tone="bad">{p.count - p.resolvedCount}회</Chip>
                      </div>
                      <div className="mt-1 text-xs text-muted">눌러서 비교 학습하기</div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}

      <Section title={`오답 노트 ${wrongs.length}`} right={tab !== 'wrongs' ? <button className="text-sm font-semibold text-brand" onClick={() => go('review/wrongs')}>전체 보기</button> : undefined}>
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          <FilterChip on={filter === 'all'} onClick={() => setFilter('all')}>
            전체 {wrongs.length}
          </FilterChip>
          {[...byCause.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => (
              <FilterChip key={k} on={filter === k} onClick={() => setFilter(k)}>
                {CAUSE_LABEL[k]} {n}
              </FilterChip>
            ))}
        </div>
        {list.length === 0 ? (
          <Empty>오답이 없어요. 틀린 문제는 원인과 함께 여기에 모여요.</Empty>
        ) : (
          <div className="space-y-2">
            {list.slice(0, tab === 'wrongs' ? 200 : 8).map((w) => {
              const c = CONCEPT_MAP.get(w.conceptId);
              return (
                <Card key={w.id} onClick={() => go(`concept/${w.conceptId}`)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-bold">{c?.name ?? w.conceptId}</div>
                    <Chip tone="bad">{CAUSE_LABEL[w.userCause ?? w.cause]}</Chip>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted">{w.prompt}</div>
                  <div className="mt-1 text-sm">
                    <span className="text-bad">내 답: {w.userAnswer || '-'}</span>
                  </div>
                  <div className="text-sm whitespace-pre-line text-ok">정답: {w.correctAnswer}</div>
                  <div className="mt-1 text-[11px] text-muted">
                    {w.day} · {KIND_LABEL[w.kind]}
                    {w.confusedWith && CONCEPT_MAP.get(w.confusedWith) && ` · ${CONCEPT_MAP.get(w.confusedWith)!.name}와(과) 혼동`}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx('shrink-0 rounded-full border px-3 py-1 text-sm font-semibold', on ? 'border-brand bg-brand2 text-brand' : 'border-line bg-card text-muted')}>
      {children}
    </button>
  );
}
