// 실제 콘텐츠 데이터에서 커리큘럼·학습 계획 문서를 생성한다: npm run docs
import { writeFileSync } from 'node:fs';
import { CONCEPTS, CONTENT_VERSION, ERA_LABEL, UMBRELLA_IDS, UNITS, VERIFICATION } from '../src/content';
import { ANALYSIS, ANALYZED_ROUNDS, frequencyOf, unitShare } from '../src/content/exams';
import { OFFICIAL_ROUNDS } from '../src/content/official';
import { STAGE_TARGETS, makePlan } from '../src/engine/planner';
import { addDays } from '../src/engine/util';

const START = '2026-11-26';
const EXAM = '2027-02-13';
const plan = makePlan({ startDate: START, examDate: EXAM, today: START, dailyMinutes: 80, mastery: new Map() });
const L: string[] = [];
const p = (s = '') => L.push(s);

p('# 전체 교육 커리큘럼과 79일 학습 계획');
p();
p(`> 이 문서는 \`npm run docs\`로 실제 앱 데이터(콘텐츠 버전 ${CONTENT_VERSION})에서 자동 생성됩니다. 직접 고치지 마세요.`);
p();
p('## 1. 학습 기간');
p();
p(`- 기본 시작일 ${START}(앱 첫 실행일), 시험일 ${EXAM}(제82회 심화, 공식 공지 확인) → **${plan.totalDays}일**`);
p('- 시작일·시험일은 설정에서 바꿀 수 있고, 바꾸면 아래 일정이 같은 비율로 자동 조정됩니다.');
p(`- 1단계 전 시대 기본 학습: Day 1–${plan.learnEnd} / 2단계 기출 유형·누적 오답: Day ${plan.learnEnd + 1}–${plan.pastEnd} / 3단계 실전 모의고사·취약 개념: Day ${plan.pastEnd + 1}–${plan.totalDays}`);
p();
p('## 2. 단원별 일정(79일 기준)');
p();
p('| 단원 | 기간 | 날짜 | 개념 수 |');
p('|---|---|---|---:|');
for (const u of plan.units) {
  const unit = UNITS.find((x) => x.id === u.unitId)!;
  p(`| UNIT ${unit.no}. ${unit.title} | Day ${u.startDay}–${u.endDay} | ${addDays(START, u.startDay - 1)} ~ ${addDays(START, u.endDay - 1)} | ${u.count} |`);
}
p(`| UNIT 11. 실전 시험 대비 | Day ${plan.learnEnd + 1}–${plan.totalDays} | ${addDays(START, plan.learnEnd)} ~ ${addDays(START, plan.totalDays - 1)} | (새 개념 없음) |`);
p();
p('## 3. 하루 80분 구성(단계별, 분)');
p();
p('| 구분 | 1단계 | 2단계 | 3단계 |');
p('|---|---:|---:|---:|');
const rows: [string, string][] = [
  ['review', '기존 지식 자동 복습'],
  ['new', '새로운 역사 지식 학습'],
  ['drill', '인물·사건·업적 반복 문제'],
  ['apply', '기출 유형 응용문제'],
  ['weak', '취약 개념 보충'],
];
const b = (phaseDay: number) => makePlan({ startDate: START, examDate: EXAM, today: addDays(START, phaseDay - 1), dailyMinutes: 80, mastery: new Map(CONCEPTS.map((c) => [c.id, { conceptId: c.id, level: 1 } as never])) }).budgets;
const b1 = makePlan({ startDate: START, examDate: EXAM, today: START, dailyMinutes: 80, mastery: new Map() }).budgets;
const b2 = b(plan.learnEnd + 2);
const b3 = b(plan.pastEnd + 2);
for (const [k, label] of rows) p(`| ${label} | ${b1[k as keyof typeof b1]} | ${b2[k as keyof typeof b2]} | ${b3[k as keyof typeof b3]} |`);
p();
p('- 2·3단계에 아직 배우지 않은 개념이 남아 있으면 응용 시간 10분을 신규 학습으로 돌려 중요도(A→B→C) 순으로 마저 배웁니다.');
p('- 학습하지 못한 날이 있으면 “어제까지 배웠어야 할 개념 수 − 실제로 배운 수”만큼을 이후 날짜에 절반씩 나눠 더하고(하루 최대 기본 분량의 2배), 밀린 동안은 잠정 중요도 A등급을 먼저 배웁니다.');
p();
p('## 4. 단계별 모의고사 목표');
p();
p('| 학습 시점 | 목표 점수 |');
p('|---|---:|');
for (const t of STAGE_TARGETS) p(`| ${t.day}일 차 | ${t.score}점 |`);
p();
p('최종 준비 완료 기준: 필수 학습 범위(A·B 등급 개념 숙련도 3 이상) 완료, 처음 보는 실제 기출 5회 평균 75점 이상, 그중 최저 65점 이상, 모든 회차를 80분 안에 완료.');
p();
p('## 5. 실제 기출 단원별 출제 비중(제57~80회 자동 분석)');
p();
p(`분석 ${ANALYZED_ROUNDS}개 회차, ${ANALYSIS.totalQuestions}문항 중 ${ANALYSIS.taggedQuestions}문항에 주 개념 자동 연결(추정치). 방법·정확도는 docs/DATA_SOURCES.md 참고.`);
p();
p('| 단원 | 비중 |');
p('|---|---:|');
const sh = unitShare();
for (const u of UNITS) p(`| UNIT ${u.no}. ${u.title} | ${((sh[u.id] ?? 0) * 100).toFixed(1)}% |`);
p();
p('## 6. 단원·레슨·개념 목록');
p();
const tierCount = (t: string) => CONCEPTS.filter((c) => c.tier === t).length;
const stCount = (st: string) => CONCEPTS.filter((c) => c.status === st).length;
p(`전체 ${CONCEPTS.length}개 개념 · 잠정 중요도 A ${tierCount('A')} / B ${tierCount('B')} / C ${tierCount('C')} · 출처 대조: 완료 ${stCount('verified')} / 일부 확인 ${stCount('partial')} / 검증 대기 ${stCount('ai_draft')}`);
p();
p(`> [잠정 중요도] 뒤의 ‘기출 n/${ANALYZED_ROUNDS}’는 최근 ${ANALYZED_ROUNDS}개 회차 중 관련 문항이 나온 회차 수(자동 분석 추정). ✱ = 여러 주체를 묶은 개념(자료형 문제에서 제외). 맨 앞 기호: ✔ 출처 대조 완료 · △ 일부 확인(7절 참고) · ? 검증 대기.`);
p();
for (const u of UNITS) {
  p(`### UNIT ${u.no}. ${u.title}`);
  p();
  p(`${u.subtitle}`);
  p();
  for (const l of u.lessons) {
    p(`**${l.title}**`);
    p();
    for (const id of l.conceptIds) {
      const c = CONCEPTS.find((x) => x.id === id)!;
      const mark = c.status === 'verified' ? '✔' : c.status === 'partial' ? '△' : '?';
      p(`- ${mark} [${c.tier}] 기출 ${frequencyOf(c.id).rounds}/${ANALYZED_ROUNDS} · ${c.name}${UMBRELLA_IDS.has(c.id) ? ' ✱' : ''}${c.when ? ` (${c.when})` : ''} — ${c.summary} · 사실 ${c.facts.length}개 · ${ERA_LABEL[c.era]}`);
    }
    p();
  }
}
p('## 7. 출처 대조 결과: 확인하지 못한 사실과 메모');
p();
p('방법은 docs/DATA_SOURCES.md 2-1절 참고. 앱 개념 화면의 “출처와 검증”에도 같은 내용이 나옵니다.');
p();
const missRows: string[] = [];
let unconf = 0;
for (const c of CONCEPTS) {
  const v = VERIFICATION[c.id];
  if (!v) continue;
  for (const f of c.facts)
    if (v.facts[f.id] === 'unconfirmed') {
      unconf++;
      missRows.push(`| ${c.name} | ${f.text} |`);
    }
  if (!v.yearsOk) missRows.push(`| ${c.name} | (표시 연대 ${c.when ?? ''} — 출처에서 같은 연도를 찾지 못함) |`);
}
p(`미확인 사실 ${unconf}개 / 전체 ${CONCEPTS.reduce((n, c) => n + c.facts.length, 0)}개.`);
p();
if (missRows.length) {
  p('| 개념 | 확인하지 못한 사실 |');
  p('|---|---|');
  missRows.forEach((r) => p(r));
  p();
}
const factCount = (k: string) => Object.values(VERIFICATION).reduce((n, v) => n + Object.values(v.facts).filter((s) => s === k).length, 0);
p(`확인 방법별: 자동(핵심어와 나머지 내용이 같은 문장 근처에서 일치) ${factCount('auto')} · 핵심어 항목에서 자동 확인 ${factCount('term')} · 사람이 본문을 읽고 확인 ${factCount('manual')}.`);
p();
p('### 메모(연대 근거·출처끼리 다른 서술)');
p();
p('| 개념 | 메모 |');
p('|---|---|');
for (const c of CONCEPTS) {
  const v = VERIFICATION[c.id];
  if (v?.note) p(`| ${c.name} | ${v.note.replace(/\|/g, '/')} |`);
}
p();
p('## 8. 공식 시험 자료실 심화 회차(확인된 목록)');
p();
p(OFFICIAL_ROUNDS.map((r) => `제${r.round}회(${r.date})`).join(', '));
p();
writeFileSync('docs/CURRICULUM.md', L.join('\n'));
console.log(`docs/CURRICULUM.md written (${CONCEPTS.length} concepts)`);
