// 검증용으로 개념 데이터를 JSON으로 내보낸다: npx tsx scripts/export-concepts.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { CONCEPTS, UNIT_MAP } from '../src/content';
mkdirSync('verify-cache', { recursive: true });
writeFileSync(
  'verify-cache/concepts.json',
  JSON.stringify(
    CONCEPTS.map((c) => ({
      id: c.id,
      name: c.name,
      aliases: c.aliases,
      q: c.refs[0]?.url ? decodeURIComponent(c.refs[0].url.split('query=')[1] ?? '') : c.name,
      kind: c.kind,
      era: c.era,
      unit: UNIT_MAP.get(c.unitId)!.title,
      when: c.when ?? '',
      sort: c.sort ?? null,
      umbrella: c.umbrella,
      facts: c.facts.map((f) => ({ id: f.id, text: f.text, blank: f.blank ?? '', generic: f.generic })),
      body: c.body,
    })),
    null,
    1,
  ),
);
console.log('exported', CONCEPTS.length);
