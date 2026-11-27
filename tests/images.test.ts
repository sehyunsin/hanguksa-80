import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPT_MAP, FACT_MAP } from '../src/content';
import { IMAGES, imagesOf } from '../src/content/images';
import { Balancer, genPhoto, grade } from '../src/engine/questions';
import { mulberry32 } from '../src/engine/util';

const LICENSES = /^(Public domain|PD|CC0|CC BY(-SA)? [0-9.]+( [a-z]{2,3})?|KOGL Type 1)$/i;

describe('문화유산 사진', () => {
  it('모든 사진에 출처·이용 조건·저작자가 있고 파일이 실제로 있다', () => {
    expect(IMAGES.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const im of IMAGES) {
      expect(ids.has(im.id), im.id).toBe(false);
      ids.add(im.id);
      expect(CONCEPT_MAP.has(im.conceptId), im.id).toBe(true);
      if (im.factId) expect(FACT_MAP.get(im.factId)?.conceptId, im.id).toBe(im.conceptId);
      expect(im.license, im.id).toMatch(LICENSES);
      expect(im.author.trim().length, im.id).toBeGreaterThan(0);
      expect(im.sourceUrl, im.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(im.checkedAt, im.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const path = `public/${im.file}`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size, path).toBeLessThan(250 * 1024);
    }
  });

  it('사진 문제: 정답은 하나, 선택지는 서로 다르고, 정답을 고르면 맞음', () => {
    const rng = mulberry32(7);
    for (const cid of new Set(IMAGES.map((im) => im.conceptId))) {
      expect(imagesOf(cid).length).toBeGreaterThan(0);
      for (let i = 0; i < 12; i++) {
        const q = genPhoto(CONCEPT_MAP.get(cid)!, { rng, balancer: new Balancer(rng) });
        expect(q, cid).not.toBeNull();
        expect(q!.image?.src).toMatch(/^heritage\//);
        const texts = q!.choices!.map((c) => c.text);
        expect(new Set(texts).size, `${cid}: ${texts.join(' | ')}`).toBe(texts.length);
        expect(q!.choices!.filter((c) => c.correct).length).toBe(1);
        const right = q!.choices!.find((c) => c.correct)!;
        expect(grade(q!, { type: 'choice', choiceId: right.id }).correct).toBe(true);
      }
    }
  });
});
