import { useEffect, useState, type ReactNode } from 'react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

// ── 아이콘(인라인 SVG) ────────────────────────────────────
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  review: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  exam: 'M8 4h8l1 2h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2zm0 0v3h8V4M8 12h8M8 16h5',
  stats: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17 19 7',
  flame: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16m4-14h7',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  play: 'M8 5v14l11-7z',
  upload: 'M12 16V4m0 0-5 5m5-5 5 5M4 20h16',
  download: 'M12 4v12m0 0-5-5m5 5 5-5M4 20h16',
  info: 'M12 8h.01M11 12h1v5h1m8-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
};
export function Icon({ name, size = 22, className, fill }: { name: keyof typeof P | string; size?: number; className?: string; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name] ?? P.info} />
    </svg>
  );
}

// ── 기본 요소 ───────────────────────────────────────────
export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C onClick={onClick} className={cx('block w-full rounded-2xl border border-line bg-card p-4 text-left shadow-[0_1px_0_rgba(0,0,0,0.03)]', onClick && 'active:scale-[0.99] transition', className)}>
      {children}
    </C>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'soft' | 'ok' | 'bad' | 'outline';
export function Button({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  big,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  className?: string;
  disabled?: boolean;
  big?: boolean;
  type?: 'button' | 'submit';
}) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand text-brandink border-b-4 border-black/20',
    ok: 'bg-ok text-white border-b-4 border-black/20',
    bad: 'bg-bad text-white border-b-4 border-black/20',
    soft: 'bg-brand2 text-brand',
    ghost: 'bg-transparent text-muted',
    outline: 'bg-card text-ink border border-line',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition active:translate-y-[1px] disabled:opacity-40',
        big ? 'min-h-14 px-5 text-lg' : 'min-h-11 px-4 text-[15px]',
        v[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Progress({ value, className, color = 'bg-brand', h = 'h-2.5' }: { value: number; className?: string; color?: string; h?: string }) {
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-card2', h, className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Ring({ value, size = 120, stroke = 12, children, color = 'var(--brand)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--card-2)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Chip({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'brand' | 'ok' | 'bad' | 'warn'; className?: string }) {
  const t = {
    muted: 'bg-card2 text-muted',
    brand: 'bg-brand2 text-brand',
    ok: 'bg-ok2 text-ok',
    bad: 'bg-bad2 text-bad',
    warn: 'bg-warn2 text-warn',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', t, className)}>{children}</span>;
}

export function Section({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-6', className)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Header({ title, onBack, right }: { title: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-20 -mx-4 mb-2 flex items-center gap-2 bg-bg/90 px-4 pb-2 backdrop-blur">
      {onBack && (
        <button onClick={onBack} aria-label="뒤로" className="-ml-2 rounded-full p-2 text-muted">
          <Icon name="back" />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold">{title}</h1>
      {right}
    </header>
  );
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="anim-up safe-bottom max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-extrabold">{title}</div>
          <button onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-muted">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={cx('mt-1 text-xl font-extrabold tabular-nums', tone)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function Confetti({ show }: { show: boolean }) {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.6 + Math.random() * 1.4,
      color: ['#2f5bea', '#ff8a2b', '#15a34a', '#e5484d', '#f5c518', '#8e44ad'][i % 6],
    })),
  );
  if (!show) return null;
  return (
    <>
      {pieces.map((p, i) => (
        <span key={i} className="confetti" style={{ left: `${p.left}vw`, background: p.color, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </>
  );
}

export function LevelDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`숙련도 ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx('h-1.5 w-3 rounded-full', i <= level ? (level >= 4 ? 'bg-ok' : 'bg-brand') : 'bg-card2')} />
      ))}
    </span>
  );
}

export const fmtMin = (sec: number) => {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
};
export const pct = (v: number) => `${Math.round(v * 100)}%`;
