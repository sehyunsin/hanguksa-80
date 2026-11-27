import { CONCEPTS, CONTENT_VERSION, UNITS } from '../content';
import { ANALYSIS, SPOT_CHECK } from '../content/exams';
import { IMAGES, licenseLabel } from '../content/images';
import { CHECKED_AT, EXAM_FORMAT, NEXT_EXAM } from '../content/official';
import { MISSING, SOURCES } from '../content/sources';
import { Card, Chip, Header, Section } from '../ui/kit';
import { back } from '../ui/router';

export default function AboutScreen() {
  const byTier = (t: string) => CONCEPTS.filter((c) => c.tier === t).length;
  const verified = CONCEPTS.filter((c) => c.status === 'verified').length;
  const partial = CONCEPTS.filter((c) => c.status === 'partial').length;
  return (
    <div>
      <Header title="자료 현황" onBack={() => back('')} />
      <Card>
        <div className="text-sm leading-6">
          콘텐츠 버전 <b>{CONTENT_VERSION}</b> · {UNITS.length}개 단원 · 개념 <b>{CONCEPTS.length}</b>개 (잠정 중요도 A {byTier('A')} · B {byTier('B')} · C {byTier('C')})
          <br />
          출처 대조: 완료 <b>{verified}</b>개 / 일부 확인 <b>{partial}</b>개 / 검증 대기 <b>{CONCEPTS.length - verified - partial}</b>개
        </div>
        <p className="mt-2 text-xs text-muted">
          완료 = 개념의 모든 사실·연도를 한국민족문화대백과사전 본문과 대조(자동 대조 + 사람 검토)하고, 백과사전에 없는 교과서식 서술은 우리역사넷(국사편찬위원회)의 신편 한국사·역대 국사교과서로 확인. 일부 확인 = 확인하지 못한 사실이 남아 있음(개념 화면에 표시). 검증 대기 = AI 초안. 자동 확인은 핵심어와 사실의 나머지 내용이 항목 본문의 같은 문장 근처에 함께 있을 때만 인정하고, 핵심어만 맞은 경우는 사람이 출처 본문을 읽고 확인함. 대조는 ‘사실’ 문장 단위이며, 문제 문장·오답 선택지·설명문은 사람이 전수 검수하지 않음.
        </p>
      </Card>

      <Section title="기출 분석(제57~80회 심화)">
        <Card className="text-sm leading-6">
          분석 {ANALYSIS.rounds.length}개 회차 · {ANALYSIS.totalQuestions}문항 중 <b>{ANALYSIS.taggedQuestions}</b>문항에 개념 자동 연결 · 정답표 {Object.keys(ANALYSIS.keys).length}개 회차 내장
          <div className="mt-1 text-xs text-muted">{ANALYSIS.method}</div>
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {SPOT_CHECK.map((s) => (
              <li key={s.round}>
                표본 검수 제{s.round}회({s.source}): {s.note}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="공식 시험 정보(직접 확인)">
        <Card className="text-sm leading-6">
          심화 {EXAM_FORMAT.questions}문항(5지 택1) · {EXAM_FORMAT.minutes}분 · 100점(문항별 1~3점) · 1급 80점↑ / 2급 70~79 / 3급 60~69
          <br />
          제{NEXT_EXAM.round}회 {NEXT_EXAM.date}(토) 심화 · 원서 접수 2027.1.12.~1.19.
          <div className="mt-1 text-xs text-muted">확인일 {CHECKED_AT} · historyexam.go.kr 시험 요강·응시 안내·공지사항</div>
        </Card>
      </Section>

      <Section title="자료 출처">
        <div className="space-y-2">
          {SOURCES.map((s) => (
            <Card key={s.name}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand underline-offset-2 hover:underline">
                {s.name}
              </a>
              <div className="mt-1 text-sm">{s.used}</div>
              <div className="mt-1">
                <Chip>{s.status}</Chip>
              </div>
              <div className="mt-1 text-xs text-muted">이용조건: {s.terms}</div>
            </Card>
          ))}
        </div>
      </Section>

      {IMAGES.length > 0 && (
        <Section title={`사진 출처 ${IMAGES.length}장`}>
          <Card className="text-xs leading-5">
            <p className="text-muted">이용 조건(퍼블릭 도메인·CC BY·CC BY-SA·공공누리 제1유형)을 원본 페이지에서 확인한 사진만 썼고, 크기만 줄였어요. 사진을 누르면 원본과 라이선스 전문을 볼 수 있어요.</p>
            <ul className="mt-2 space-y-1">
              {IMAGES.map((im) => (
                <li key={im.id}>
                  <a href={im.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline-offset-2 hover:underline">
                    {im.name}
                  </a>{' '}
                  — {im.author} ·{' '}
                  {im.licenseUrl ? (
                    <a href={im.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {licenseLabel(im.license)}
                    </a>
                  ) : (
                    licenseLabel(im.license)
                  )}{' '}
                  · {im.sourceName} (확인 {im.checkedAt})
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      <Section title="미확보 자료·미완료 작업">
        <div className="space-y-2">
          {MISSING.map((m) => (
            <Card key={m.item}>
              <div className="font-bold">{m.item}</div>
              <div className="mt-1 text-sm text-muted">{m.detail}</div>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
