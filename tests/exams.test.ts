import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANALYSIS, ANALYZED_ROUNDS, examTags, frequencyOf, officialKey, unitShare } from '../src/content/exams';
import { OFFICIAL_ROUNDS } from '../src/content/official';
import { generateMockExam, parseAnswerKeyText, scoreAnswers, validateKey } from '../src/engine/exam';
import { mulberry32 } from '../src/engine/util';
import { CONCEPT_MAP } from '../src/content';

describe('공식 기출 분석 데이터', () => {
  it('공식 자료실의 24개 회차 정답표가 모두 들어 있고 유효하다(50문항·100점)', () => {
    expect(ANALYZED_ROUNDS).toBe(24);
    for (const r of OFFICIAL_ROUNDS) {
      const k = officialKey(r.round)!;
      expect(k, `${r.round}회`).toBeDefined();
      expect(validateKey(k), `${r.round}회`).toEqual([]);
    }
  });
  it('정정으로 정답이 없는 문항(63회 42번)은 전원 정답 처리', () => {
    const k = officialKey(63)!;
    expect(k[41].all).toBe(true);
    const answers = k.map((x) => x.ans);
    answers[41] = 3;
    expect(scoreAnswers(k, answers).score).toBe(100);
  });
  it('태그는 존재하는 개념만 가리키고, 대부분의 문항에 개념이 연결되어 있다', () => {
    let tagged = 0;
    for (const r of ANALYSIS.rounds) {
      const tags = examTags(r)!;
      expect(tags.length).toBe(50);
      for (const t of tags) {
        for (const id of [t.primary, t.correct, ...t.related].filter(Boolean) as string[]) expect(CONCEPT_MAP.has(id), id).toBe(true);
        if (t.primary) tagged++;
      }
    }
    expect(tagged).toBeGreaterThan(1000);
    expect(frequencyOf('gr-gwangjong').rounds).toBeGreaterThan(0);
  });
  it('단원별 출제 비중의 합은 1이고, 창작 모의고사도 50문항·100점을 유지한다', () => {
    const sum = Object.values(unitShare()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    const exam = generateMockExam(mulberry32(9));
    expect(exam.length).toBe(50);
    expect(exam.reduce((a, x) => a + x.pts, 0)).toBe(100);
  });
  it('앱의 정답표 자동 읽기가 실제 공식 정답표 24개를 모두 정확히 읽는다(원본 텍스트가 있을 때)', () => {
    let checked = 0;
    for (const r of OFFICIAL_ROUNDS) {
      const path = `exam-pdfs/text/${r.round}-a.txt`;
      if (!existsSync(path)) continue;
      const { key } = parseAnswerKeyText(readFileSync(path, 'utf8'));
      const ref = officialKey(r.round)!;
      expect(key.map((x) => [x.all ? 0 : x.ans, x.pts]), `${r.round}회`).toEqual(ref.map((x) => [x.all ? 0 : x.ans, x.pts]));
      checked++;
    }
    if (checked === 0) console.warn('exam-pdfs/text 가 없어 실제 정답표 읽기 검사는 건너뜀');
  });
});
