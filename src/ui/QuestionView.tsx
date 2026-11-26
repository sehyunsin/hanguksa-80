import { useEffect, useMemo, useState } from 'react';
import type { Grade, Question, Response } from '../engine/questions';
import { shuffle } from '../engine/util';
import { Chip, cx } from './kit';

const NUM = ['①', '②', '③', '④', '⑤'];
const PAIR_COLORS = ['bg-sky-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-emerald-500'];

export function Passage({ q }: { q: Question }) {
  if (!q.passage?.length && !q.chip) return null;
  return (
    <div className="mt-3 rounded-2xl border border-line bg-card2 p-4">
      {(q.chip || q.passageTitle) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {q.chip && <Chip tone="brand">{q.chip}</Chip>}
          {q.passageTitle && <Chip>{q.passageTitle}</Chip>}
        </div>
      )}
      <div className="space-y-1.5 text-[16px] leading-7">
        {q.passage?.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}

export default function QuestionView({
  q,
  revealed,
  onChange,
}: {
  q: Question;
  revealed: Grade | null;
  onChange: (r: Response | null) => void;
}) {
  return (
    <div className="anim-pop">
      <h2 className="text-[19px] leading-7 font-extrabold">{q.prompt}</h2>
      <Passage q={q} />
      <div className="mt-4">
        {q.kind === 'short' ? (
          <ShortInput q={q} revealed={revealed} onChange={onChange} />
        ) : q.kind === 'match' ? (
          <MatchInput q={q} revealed={revealed} onChange={onChange} />
        ) : q.kind === 'sort2' ? (
          <SortInput q={q} revealed={revealed} onChange={onChange} />
        ) : q.kind === 'order' ? (
          <OrderInput q={q} revealed={revealed} onChange={onChange} />
        ) : (
          <ChoiceInput q={q} revealed={revealed} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function ChoiceInput({ q, revealed, onChange }: { q: Question; revealed: Grade | null; onChange: (r: Response | null) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [q.id]);
  const choose = (id: string) => {
    if (revealed) return;
    setSel(id);
    onChange({ type: 'choice', choiceId: id });
  };
  if (q.kind === 'ox') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {q.choices!.map((c) => {
          const state = revealed ? (c.correct ? 'ok' : sel === c.id ? 'bad' : 'idle') : sel === c.id ? 'sel' : 'idle';
          return (
            <button
              key={c.id}
              onClick={() => choose(c.id)}
              className={cx(
                'h-28 rounded-3xl border-2 border-b-4 text-5xl font-black transition',
                state === 'sel' && 'border-brand bg-brand2 text-brand',
                state === 'ok' && 'border-ok bg-ok2 text-ok',
                state === 'bad' && 'anim-shake border-bad bg-bad2 text-bad',
                state === 'idle' && 'border-line bg-card',
              )}
            >
              {c.text}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {q.choices!.map((c, i) => {
        const state = revealed ? (c.correct ? 'ok' : sel === c.id ? 'bad' : 'idle') : sel === c.id ? 'sel' : 'idle';
        return (
          <button
            key={c.id}
            onClick={() => choose(c.id)}
            className={cx(
              'flex w-full items-start gap-3 rounded-2xl border-2 border-b-4 px-4 py-3 text-left text-[16px] leading-6 transition',
              state === 'sel' && 'border-brand bg-brand2',
              state === 'ok' && 'border-ok bg-ok2',
              state === 'bad' && 'anim-shake border-bad bg-bad2',
              state === 'idle' && 'border-line bg-card',
            )}
          >
            <span className={cx('mt-0.5 shrink-0 font-bold', state === 'sel' ? 'text-brand' : 'text-muted')}>{q.numbered ? NUM[i] : String.fromCharCode(65 + i)}</span>
            <span className="min-w-0 flex-1">
              {c.text}
              {revealed && c.note && !c.correct && <span className="mt-0.5 block text-xs text-muted">{c.note}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ShortInput({ q, revealed, onChange }: { q: Question; revealed: Grade | null; onChange: (r: Response | null) => void }) {
  const [v, setV] = useState('');
  useEffect(() => setV(''), [q.id]);
  return (
    <div>
      <input
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onChange(e.target.value.trim() ? { type: 'text', text: e.target.value } : null);
        }}
        disabled={!!revealed}
        placeholder="정답 입력"
        autoComplete="off"
        className={cx('w-full rounded-2xl border-2 bg-card px-4 py-3 text-lg outline-none', revealed ? (revealed.correct ? 'border-ok' : 'border-bad') : 'border-line focus:border-brand')}
      />
      <div className="mt-1 text-xs text-muted">띄어쓰기·가운뎃점은 무시하고 채점해요.</div>
    </div>
  );
}

function MatchInput({ q, revealed, onChange }: { q: Question; revealed: Grade | null; onChange: (r: Response | null) => void }) {
  const rights = useMemo(() => shuffle(q.pairs!.map((p) => ({ id: p.rightId, text: p.right }))), [q.id]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    setMap({});
    setLeft(null);
  }, [q.id]);
  const leftIds = q.pairs!.map((p) => p.leftId);
  const colorOf = (leftId: string) => PAIR_COLORS[leftIds.indexOf(leftId) % PAIR_COLORS.length];
  const update = (m: Record<string, string>) => {
    setMap(m);
    onChange(Object.keys(m).length === q.pairs!.length ? { type: 'pairs', map: m } : null);
  };
  const tapRight = (rid: string) => {
    if (revealed) return;
    const owner = Object.keys(map).find((k) => map[k] === rid);
    if (owner && !left) {
      const m = { ...map };
      delete m[owner];
      update(m);
      return;
    }
    if (!left) return;
    const m = { ...map };
    if (owner) delete m[owner];
    m[left] = rid;
    update(m);
    setLeft(null);
  };
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
      <div className="space-y-2">
        {q.pairs!.map((p) => {
          const paired = !!map[p.leftId];
          return (
            <button
              key={p.leftId}
              onClick={() => !revealed && setLeft(left === p.leftId ? null : p.leftId)}
              className={cx('flex w-full items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-3 text-left text-[15px] font-bold', left === p.leftId ? 'border-brand bg-brand2' : 'border-line bg-card')}
            >
              <span className={cx('h-3 w-3 shrink-0 rounded-full', paired ? colorOf(p.leftId) : 'bg-card2')} />
              {p.left}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {rights.map((r) => {
          const owner = Object.keys(map).find((k) => map[k] === r.id);
          const correctOwner = q.pairs!.find((p) => p.rightId === r.id)!.leftId;
          const ok = revealed && owner === correctOwner;
          return (
            <button
              key={r.id}
              onClick={() => tapRight(r.id)}
              className={cx(
                'flex w-full items-start gap-2 rounded-2xl border-2 border-b-4 px-3 py-2.5 text-left text-[14px] leading-5',
                revealed ? (ok ? 'border-ok bg-ok2' : 'border-bad bg-bad2') : owner ? 'border-line bg-card' : 'border-line bg-card',
              )}
            >
              <span className={cx('mt-1 h-3 w-3 shrink-0 rounded-full', owner ? colorOf(owner) : 'bg-card2')} />
              <span>
                {r.text}
                {revealed && !ok && <span className="block text-xs font-bold text-ok">→ {q.pairs!.find((p) => p.leftId === correctOwner)!.left}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {!revealed && <div className="col-span-2 text-xs text-muted">왼쪽을 먼저 누른 뒤 오른쪽의 짝을 누르세요. 다시 누르면 연결이 풀려요.</div>}
    </div>
  );
}

function SortInput({ q, revealed, onChange }: { q: Question; revealed: Grade | null; onChange: (r: Response | null) => void }) {
  const [map, setMap] = useState<Record<string, 'A' | 'B'>>({});
  useEffect(() => setMap({}), [q.id]);
  const set = (id: string, g: 'A' | 'B') => {
    if (revealed) return;
    const m = { ...map, [id]: g };
    setMap(m);
    onChange(Object.keys(m).length === q.sortItems!.length ? { type: 'sort', map: m } : null);
  };
  return (
    <div className="space-y-2.5">
      {q.sortItems!.map((it) => {
        const ok = revealed && map[it.id] === it.group;
        return (
          <div key={it.id} className={cx('rounded-2xl border-2 bg-card p-3', revealed ? (ok ? 'border-ok' : 'border-bad') : 'border-line')}>
            <div className="text-[15px] leading-6">{it.text}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => set(it.id, g)}
                  className={cx(
                    'truncate rounded-xl border-2 px-2 py-2 text-sm font-bold',
                    map[it.id] === g ? 'border-brand bg-brand2 text-brand' : 'border-line text-muted',
                    revealed && it.group === g && 'border-ok bg-ok2 text-ok',
                  )}
                >
                  {q.groups![g]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderInput({ q, revealed, onChange }: { q: Question; revealed: Grade | null; onChange: (r: Response | null) => void }) {
  const [seq, setSeq] = useState<string[]>([]);
  useEffect(() => setSeq([]), [q.id]);
  const items = q.orderItems!;
  const update = (s: string[]) => {
    setSeq(s);
    onChange(s.length === items.length ? { type: 'order', ids: s } : null);
  };
  const nameOf = (id: string) => items.find((x) => x.id === id)!;
  return (
    <div>
      <div className="min-h-[120px] space-y-2 rounded-2xl border-2 border-dashed border-line p-2">
        {seq.length === 0 && <div className="p-4 text-center text-sm text-muted">먼저 일어난 것부터 아래에서 차례로 누르세요</div>}
        {seq.map((id, i) => {
          const ok = revealed && q.correctOrder![i] === id;
          return (
            <button key={id} onClick={() => !revealed && update(seq.filter((x) => x !== id))} className={cx('flex w-full items-center gap-3 rounded-xl border-2 bg-card px-3 py-2.5 text-left font-semibold', revealed ? (ok ? 'border-ok' : 'border-bad') : 'border-brand')}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-brandink">{i + 1}</span>
              <span className="flex-1">{nameOf(id).text}</span>
              {revealed && <span className="text-xs text-muted">{nameOf(id).when}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items
          .filter((x) => !seq.includes(x.id))
          .map((x) => (
            <button key={x.id} onClick={() => !revealed && update([...seq, x.id])} className="rounded-xl border-2 border-b-4 border-line bg-card px-3 py-2 text-[15px] font-semibold">
              {x.text}
            </button>
          ))}
      </div>
      {revealed && !revealed.correct && <div className="mt-3 text-sm font-semibold text-ok">정답 순서: {revealed.correctAnswer}</div>}
    </div>
  );
}
