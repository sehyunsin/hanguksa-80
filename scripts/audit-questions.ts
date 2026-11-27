// 문제 생성 재료 점검 보고서. 사용: npx tsx scripts/audit-questions.ts [출력 파일]
// 점검 기준은 scripts/audit-lib.ts, 사람이 판단한 예외는 src/content/overlaps.ts
import { writeFileSync } from 'node:fs';
import { blankIssues, nameLeaks, riskPairs, staleExceptions } from './audit-lib';

const pairs = riskPairs();
const count = (h: string) => pairs.filter((p) => p.handled === h).length;
const out: string[] = [`# 문제 재료 점검 (${new Date().toISOString().slice(0, 10)})`];
out.push(
  `\n## 다른 개념에도 해당할 수 있는 사실: ${pairs.length}건 — 예외 목록 ${count('also-true')} · 이름 규칙 ${count('name')} · 사람이 ‘틀림’ 확인 ${count('checked-false')} · 미검토 ${count('unreviewed')}`,
);
for (const p of pairs)
  out.push(`[${p.handled}] ${p.id}  ${p.target.name} ← ${p.owner.name} “${p.fact.text}” (${p.detail})`);
const leaks = nameLeaks();
out.push(`\n## 사실 문장에 정답 이름(누구·자료형 문제에서 엔진이 건너뜀): ${leaks.facts.length}건`, ...leaks.facts);
out.push(`\n## 직접 쓴 자료에 정답 이름(고쳐야 함): ${leaks.clues.length}건`, ...leaks.clues);
const bl = blankIssues();
out.push(`\n## 빈칸어가 문장에 없음: ${bl.missing.length}건`, ...bl.missing);
out.push(`\n## 빈칸어가 두 번 이상(모두 가림): ${bl.repeated.length}건`, ...bl.repeated);
const stale = staleExceptions();
out.push(`\n## 낡은 예외 기록: ${stale.length}건`, ...stale);
const file = process.argv[2];
if (file) writeFileSync(file, out.join('\n'), 'utf8');
console.log(`조합 ${pairs.length} (미검토 ${count('unreviewed')}) · 이름 노출 자료 ${leaks.clues.length} · 빈칸 없음 ${bl.missing.length} · 낡은 예외 ${stale.length}`);
