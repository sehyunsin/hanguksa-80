// 공통 유틸: 한글 조사, 난수, 날짜

// ── 한글 조사 ────────────────────────────────────────────
const DIGIT_JONG = ['ㅇ', 'ㄹ', '', 'ㅁ', '', '', 'ㄱ', 'ㄹ', 'ㄹ', ''];
/** 마지막 글자의 받침. 받침 없으면 '', 판단 불가면 null */
export function finalJong(word: string): string | null {
  const s = word.replace(/[\s)\]」』"'’”.!?]+$/g, '');
  if (!s) return null;
  const ch = s[s.length - 1];
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const j = (code - 0xac00) % 28;
    if (j === 0) return '';
    return j === 8 ? 'ㄹ' : 'x';
  }
  if (/[0-9]/.test(ch)) return DIGIT_JONG[Number(ch)];
  if (/[a-zA-Z]/.test(ch)) return /[lmnr]$/i.test(ch) ? 'x' : '';
  return null;
}
export function josa(word: string, pair: '은/는' | '이/가' | '을/를' | '과/와' | '으로/로' | '이다/다'): string {
  const j = finalJong(word);
  const [withJong, noJong] = pair.split('/');
  if (j === null) return `${word}${withJong}(${noJong})`;
  if (pair === '으로/로') return word + (j === '' || j === 'ㄹ' ? noJong : withJong);
  return word + (j === '' ? noJong : withJong);
}

// ── 난수 ────────────────────────────────────────────────
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const defaultRng: Rng = () => Math.random();
export function shuffle<T>(arr: readonly T[], rng: Rng = defaultRng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function pick<T>(arr: readonly T[], rng: Rng = defaultRng): T {
  return arr[Math.floor(rng() * arr.length)];
}
export function uid(rng: Rng = defaultRng): string {
  return Math.floor(rng() * 1e12).toString(36) + Date.now().toString(36).slice(-4);
}

// ── 날짜(로컬 기준 YYYY-MM-DD) ──────────────────────────
export function dayKey(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** b - a (일) */
export function daysBetween(a: string, b: string): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86400000);
}
export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
