import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { getSettings } from './db/repo';
import './index.css';

registerSW({ immediate: true });

// 저장 공간이 브라우저에 의해 임의로 지워지지 않도록 요청(지원 브라우저만)
navigator.storage?.persist?.().catch(() => {});

// 첫 실행 시 기본 설정(시작일 = 오늘, 시험일 = 2027-02-13)을 만든 뒤 화면을 그린다
getSettings()
  .catch((e) => console.error(e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
