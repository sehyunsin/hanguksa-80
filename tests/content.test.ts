import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPTS, UNITS, VERIFICATION, validateContent } from '../src/content';

describe('콘텐츠 무결성', () => {
  it('검증 오류가 없다', () => {
    const problems = validateContent();
    if (problems.length) console.log(problems.join('\n'));
    expect(problems).toEqual([]);
  });
  it('10개 단원과 충분한 개념 수', () => {
    expect(UNITS.length).toBe(10);
    expect(CONCEPTS.length).toBeGreaterThan(200);
  });
});

describe('백과사전 검증 기록', () => {
  const byId = new Map(CONCEPTS.map((c) => [c.id, c]));
  it('기록의 개념·사실 ID가 현재 콘텐츠와 정확히 일치한다', () => {
    const problems: string[] = [];
    for (const [cid, v] of Object.entries(VERIFICATION)) {
      const c = byId.get(cid);
      if (!c) {
        problems.push(`없는 개념: ${cid}`);
        continue;
      }
      const want = c.facts.map((f) => f.id).sort();
      const got = Object.keys(v.facts).sort();
      if (want.join() !== got.join()) problems.push(`${cid}: 사실 ID 불일치 ${got.join()} ≠ ${want.join()}`);
    }
    expect(problems).toEqual([]);
  });
  it('verified는 모든 사실이 확인되고 연대도 맞을 때만, 출처는 백과사전 항목 또는 우리역사넷 문서', () => {
    for (const [cid, v] of Object.entries(VERIFICATION)) {
      const allOk = Object.values(v.facts).every((s) => s !== 'unconfirmed') && v.yearsOk;
      expect(v.status === 'verified', cid).toBe(allOk);
      expect(v.sources.length, cid).toBeGreaterThan(0);
      for (const s of v.sources)
        expect(s.url, cid).toMatch(/^https:\/\/(encykorea\.aks\.ac\.kr\/Article\/E\d{7}|contents\.history\.go\.kr\/id\/[a-z]{2}_[a-z0-9_]+)$/);
    }
  });
  it('사람 확인 기록(scripts/verify-manual.json)이 현재 사실을 가리키고, 사람 확인 사실마다 근거가 있다', () => {
    const manual = JSON.parse(readFileSync('scripts/verify-manual.json', 'utf8')) as {
      facts: Record<string, string>;
      reviewed: Record<string, string>;
    };
    const factIds = new Set(CONCEPTS.flatMap((c) => c.facts.map((f) => f.id)));
    const stale = [...Object.keys(manual.facts), ...Object.keys(manual.reviewed)].filter((id) => !factIds.has(id));
    expect(stale).toEqual([]);
    for (const v of Object.values(VERIFICATION))
      for (const [fid, s] of Object.entries(v.facts))
        if (s === 'manual') expect(manual.facts[fid] ?? manual.reviewed[fid], fid).toMatch(/E\d{7}|(nh|ta|hm|km)_[a-z0-9]/);
  });
  it('앱 개념의 상태가 검증 기록을 따른다', () => {
    for (const c of CONCEPTS) {
      const v = VERIFICATION[c.id];
      expect(c.status, c.id).toBe(v ? v.status : 'ai_draft');
    }
  });
});
