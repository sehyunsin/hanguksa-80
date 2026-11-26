import { useRef, useState } from 'react';
import { exportBackup, importBackup, resetAll, saveSettings } from '../db/repo';
import { daysBetween } from '../engine/util';
import { useSettings } from '../ui/hooks';
import { Button, Card, Header, Icon, Section, cx } from '../ui/kit';
import { back, go } from '../ui/router';

export default function SettingsScreen() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  if (!s) return null;
  const total = daysBetween(s.startDate, s.examDate);

  const doExport = async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hanguksa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setMsg('백업 파일을 저장했어요. 클라우드 드라이브 등 안전한 곳에 보관하세요.');
  };
  const doImport = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      if (!confirm('지금 기기의 학습 기록을 백업 파일 내용으로 바꿉니다. 계속할까요?')) return;
      const { counts } = await importBackup(json);
      setMsg(`복원 완료: 개념 기록 ${counts.mastery}개, 응답 기록 ${counts.history}개, 시험 ${counts.exams}회`);
    } catch (e) {
      setMsg(`복원 실패: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <Header title="설정" onBack={() => back('')} />
      <Section title="학습 계획">
        <Card className="space-y-3">
          <Field label="학습 시작일">
            <input type="date" value={s.startDate} onChange={(e) => e.target.value && saveSettings({ startDate: e.target.value })} className="rounded-xl border border-line bg-card px-3 py-2" />
          </Field>
          <Field label="시험일">
            <input type="date" value={s.examDate} onChange={(e) => e.target.value && saveSettings({ examDate: e.target.value })} className="rounded-xl border border-line bg-card px-3 py-2" />
          </Field>
          <div className="text-xs text-muted">학습 기간 {total}일 · 기간이 바뀌면 단원 일정과 하루 분량이 자동으로 다시 계산돼요. 제82회 시험은 2027-02-13(토, 공식 공지 확인).</div>
          <Field label="하루 목표(분)">
            <select value={s.dailyMinutes} onChange={(e) => saveSettings({ dailyMinutes: Number(e.target.value) })} className="rounded-xl border border-line bg-card px-3 py-2">
              {[40, 60, 80, 100, 120].map((n) => (
                <option key={n} value={n}>
                  {n}분
                </option>
              ))}
            </select>
          </Field>
          <Field label="한 세션 길이">
            <select value={s.sessionMinutes} onChange={(e) => saveSettings({ sessionMinutes: Number(e.target.value) })} className="rounded-xl border border-line bg-card px-3 py-2">
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  약 {n}분
                </option>
              ))}
            </select>
          </Field>
        </Card>
      </Section>

      <Section title="화면">
        <Card>
          <div className="grid grid-cols-3 gap-2">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} onClick={() => saveSettings({ theme: t })} className={cx('rounded-xl border-2 py-2 text-sm font-bold', s.theme === t ? 'border-brand bg-brand2 text-brand' : 'border-line')}>
                {t === 'system' ? '기기 설정' : t === 'light' ? '라이트' : '다크'}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.askCause} onChange={(e) => saveSettings({ askCause: e.target.checked })} />
            오답 후 원인 고르기 버튼 보이기
          </label>
        </Card>
      </Section>

      <Section title="백업과 복원">
        <Card className="space-y-2">
          <p className="text-sm text-muted">학습 기록은 이 기기의 브라우저에만 저장돼요. 브라우저 데이터 삭제나 기기 교체에 대비해 주기적으로 백업하세요. (등록한 기출 PDF는 용량 때문에 백업에서 제외 — 공식 자료실에서 다시 받을 수 있어요)</p>
          <Button className="w-full" onClick={doExport}>
            <Icon name="download" size={18} /> 백업 파일 저장(JSON)
          </Button>
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> 백업 파일에서 복원
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          {msg && <div className="rounded-xl bg-card2 p-2 text-sm">{msg}</div>}
        </Card>
      </Section>

      <Section title="정보">
        <Card onClick={() => go('about')}>
          <div className="font-bold">자료 현황 · 출처 · 미확보 목록</div>
          <div className="text-sm text-muted">콘텐츠 검증 상태와 공식 자료 확보 범위를 확인해요.</div>
        </Card>
        <Button
          variant="ghost"
          className="mt-4 w-full text-bad"
          onClick={async () => {
            if (!confirm('모든 학습 기록을 삭제합니다. 되돌릴 수 없어요. 먼저 백업하셨나요?')) return;
            if (!confirm('정말 삭제할까요?')) return;
            await resetAll();
            go('');
          }}
        >
          모든 학습 기록 초기화
        </Button>
      </Section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
