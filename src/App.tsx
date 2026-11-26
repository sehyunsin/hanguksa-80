import { useEffect } from 'react';
import ConceptScreen from './screens/ConceptScreen';
import ExamRunner from './screens/ExamRunner';
import ExamScreen from './screens/ExamScreen';
import Home from './screens/Home';
import LearnScreen from './screens/LearnScreen';
import MapScreen from './screens/MapScreen';
import ReviewScreen from './screens/ReviewScreen';
import SettingsScreen from './screens/SettingsScreen';
import StatsScreen from './screens/StatsScreen';
import AboutScreen from './screens/AboutScreen';
import { useSettings } from './ui/hooks';
import { cx, Icon } from './ui/kit';
import { go, useRoute } from './ui/router';

const NAV = [
  { path: '', label: '홈', icon: 'home' },
  { path: 'map', label: '학습 지도', icon: 'map' },
  { path: 'review', label: '복습', icon: 'review' },
  { path: 'exam', label: '실전 시험', icon: 'exam' },
  { path: 'stats', label: '학습 통계', icon: 'stats' },
];

function useTheme() {
  const settings = useSettings();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = settings?.theme ?? 'system';
      const dark = t === 'dark' || (t === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1218' : '#f6f4ef');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings?.theme]);
}

export default function App() {
  useTheme();
  const route = useRoute();
  const [top, a1] = route;
  const immersive = top === 'learn' || (top === 'exam' && a1 === 'run');

  let screen;
  switch (top) {
    case undefined:
      screen = <Home />;
      break;
    case 'map':
      screen = <MapScreen openUnit={a1} />;
      break;
    case 'concept':
      screen = <ConceptScreen id={a1} />;
      break;
    case 'learn':
      screen = <LearnScreen />;
      break;
    case 'review':
      screen = <ReviewScreen tab={a1} />;
      break;
    case 'exam':
      screen = a1 === 'run' ? <ExamRunner /> : <ExamScreen resultId={a1 === 'result' ? Number(route[2]) : undefined} />;
      break;
    case 'stats':
      screen = <StatsScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'about':
      screen = <AboutScreen />;
      break;
    default:
      screen = <Home />;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      <main className={cx('flex-1 px-4', immersive ? 'pb-4' : 'pb-28')}>{screen}</main>
      {!immersive && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
          <div className="mx-auto grid max-w-xl grid-cols-5">
            {NAV.map((n) => {
              const active = (top ?? '') === n.path || (n.path === 'map' && top === 'concept');
              return (
                <button key={n.path} onClick={() => go(n.path)} className={cx('flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-semibold', active ? 'text-brand' : 'text-muted')} aria-current={active ? 'page' : undefined}>
                  <Icon name={n.icon} size={24} />
                  {n.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
