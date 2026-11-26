import { useEffect, useState } from 'react';

export function parseHash(h = window.location.hash): string[] {
  return h.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const h = () => {
      setR(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return r;
}

export function go(path: string) {
  const target = '#/' + path.replace(/^\/?/, '');
  if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = target;
}

export function back(fallback = '') {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
}
