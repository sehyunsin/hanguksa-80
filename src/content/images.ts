// 문화유산 사진(사진 문제·개념 화면용). 사진마다 출처와 이용 조건(라이선스·저작자)을 함께 기록한다.
// 파일은 public/heritage/ 에 있고 앱과 함께 오프라인용으로 저장된다.
// 이용 조건이 확인된 사진만 넣는다(퍼블릭 도메인 / CC BY / CC BY-SA / 공공누리 제1유형). 화면에는 반드시 출처를 함께 표시.
import data from './images.json';

export type ImageKind = 'heritage' | 'person' | 'map';

export interface HeritageImage {
  id: string;
  conceptId: string;
  /** 문화유산(기본) / 인물 초상·사진 / 역사 지도 — 사진 문제의 발문과 오답 후보를 종류별로 나눈다 */
  kind?: ImageKind;
  /** 사진 속 문화유산을 설명하는 이 개념의 사실(있을 때) */
  factId?: string;
  /** 사진 속 문화유산 이름. 예: '불국사 3층 석탑(석가탑)' */
  name: string;
  /** public/ 기준 상대 경로 */
  file: string;
  width: number;
  height: number;
  /** 원본 파일 설명 페이지 */
  sourceUrl: string;
  sourceName: string;
  license: string;
  licenseUrl?: string;
  author: string;
  checkedAt: string;
}

export const IMAGES = data as HeritageImage[];

const byConcept = new Map<string, HeritageImage[]>();
for (const im of IMAGES) byConcept.set(im.conceptId, [...(byConcept.get(im.conceptId) ?? []), im]);

export const imagesOf = (conceptId: string): HeritageImage[] => byConcept.get(conceptId) ?? [];

export const kindOf = (im: HeritageImage): ImageKind => im.kind ?? 'heritage';

/** 라이선스 표시 이름 */
export const licenseLabel = (l: string) =>
  l === 'KOGL Type 1' ? '공공누리 제1유형' : /^public domain$/i.test(l) ? '퍼블릭 도메인' : l === 'Attribution' ? '저작자 표시' : l;

/** 화면에 붙일 출처 표기 */
export const creditOf = (im: HeritageImage) => `${im.author} · ${licenseLabel(im.license)} · ${im.sourceName}`;
