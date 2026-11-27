// 기출 PDF → 텍스트(분석용, exam-pdfs/text/, git 제외). node scripts/extract-text.mjs exam-pdfs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const dir = process.argv[2] ?? 'exam-pdfs';
const outDir = join(dir, 'text');
mkdirSync(outDir, { recursive: true });
const only = process.argv[3];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.pdf') && (!only || x.startsWith(only)))) {
  const data = new Uint8Array(readFileSync(join(dir, f)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const half = vp.width / 2;
    // 2단 편집: 왼쪽 단(위→아래) 다음 오른쪽 단. 같은 줄(y 차이 3 이내)은 x 순서로 이어 붙인다.
    const items = tc.items
      .filter((it) => 'str' in it && it.str.trim() !== '')
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }));
    const lines = [];
    for (const col of [0, 1]) {
      const its = items.filter((it) => (it.x < half ? 0 : 1) === col).sort((a, b) => b.y - a.y || a.x - b.x);
      let cur = null;
      for (const it of its) {
        if (cur && Math.abs(cur.y - it.y) <= 3) cur.parts.push(it);
        else {
          if (cur) lines.push(cur.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(''));
          cur = { y: it.y, parts: [it] };
        }
      }
      if (cur) lines.push(cur.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(''));
    }
    pages.push(`=== PAGE ${i} ===\n` + lines.join('\n'));
  }
  const text = pages.join('\n');
  writeFileSync(join(outDir, f.replace('.pdf', '.txt')), text);
  console.log(f, doc.numPages, 'pages', text.length, 'chars');
}
