// pdf.js는 처음 필요할 때만 불러온다(초기 로딩 가볍게). 서비스 워커가 함께 캐시하므로 오프라인에서도 동작.
type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!lib) {
    lib = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return lib;
}

export async function openPdf(data: ArrayBuffer) {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
}

export async function pdfText(data: ArrayBuffer): Promise<string> {
  const doc = await openPdf(data);
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // 같은 높이(y)의 글자끼리 한 줄로 묶는다(정답표의 행 구조 유지)
    const items = tc.items.filter((it) => 'str' in it && it.str.trim()).map((it) => ({ x: (it as { transform: number[] }).transform[4], y: (it as { transform: number[] }).transform[5], s: (it as { str: string }).str }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: string[] = [];
    let cur: { y: number; parts: { x: number; s: string }[] } | null = null;
    for (const it of items) {
      if (cur && Math.abs(cur.y - it.y) <= 3) cur.parts.push(it);
      else {
        if (cur) lines.push(cur.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '));
        cur = { y: it.y, parts: [it] };
      }
    }
    if (cur) lines.push(cur.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '));
    parts.push(lines.join('\n'));
  }
  return parts.join('\n');
}
