// 사료 원문 링크: 공식 사료 데이터베이스의 해당 기사(번역문·원문)로 연결만 한다.
// 번역문은 각 기관(국사편찬위원회 등)의 저작물이라 앱에 옮겨 싣지 않는다.
// 2026-11-27 각 링크를 열어 기사 제목과 본문이 개념의 자료(요지)와 맞는지 확인함.

export interface PrimarySource {
  /** 사료 이름과 위치 */
  title: string;
  /** 제공 기관·데이터베이스 */
  site: string;
  url: string;
}

export const PRIMARY_CHECKED_AT = '2026-11-27';

const SILLOK = '조선왕조실록(국사편찬위원회)';
const HDB = '한국사데이터베이스(국사편찬위원회)';
const sillok = (id: string) => `https://sillok.history.go.kr/id/${id}`;
const ancient = (id: string) => `https://db.history.go.kr/ancient/level.do?levelId=${id}`;
const goryeo = (id: string) => `https://db.history.go.kr/goryeo/level.do?levelId=${id}`;

export const PRIMARY_SOURCES: Record<string, PrimarySource[]> = {
  gojoseon: [{ title: '『삼국유사』 권1 기이 고조선 — 환웅이 풍백·우사·운사를 거느리고 내려오다', site: HDB, url: ancient('sy_001r_0020_0020_0020') }],
  'sl-beopheung': [{ title: '『삼국사기』 권4 신라본기 법흥왕 — 불교가 비로소 널리 퍼지다(이차돈의 순교)', site: HDB, url: ancient('sg_004r_0030_0110') }],
  'gr-gwangjong': [{ title: '『고려사』 권88 후비전 — 광종 후비 대목왕후(노비안검과 왕후의 간언)', site: HDB, url: goryeo('kr_088r_0010_0380') }],
  'gr-seongjong': [{ title: '『고려사』 권93 열전 최승로 — 시무책 28조를 올리다', site: HDB, url: goryeo('kr_093r_0010_0020_0040') }],
  'gr-choeseungno': [{ title: '『고려사』 권93 열전 최승로 — 시무책 28조를 올리다', site: HDB, url: goryeo('kr_093r_0010_0020_0040') }],
  'gr-khitan': [{ title: '『고려사』 권94 열전 서희 — 소손녕과의 외교 담판으로 강동 6주를 확보하다', site: HDB, url: goryeo('kr_094r_0010_0010_0040') }],
  'gr-choechungheon': [{ title: '『고려사』 권129 열전 최충헌 — 최충헌과 최충수가 봉사를 올리다', site: HDB, url: goryeo('kr_129r_0010_0010_0020') }],
  'gr-revolts': [{ title: '『고려사』 권129 열전 최충헌 — 만적이 변란을 모의하다 처형당하다', site: HDB, url: goryeo('kr_129r_0010_0010_0050') }],
  'gr-gongmin': [{ title: '『고려사』 권132 열전 신돈 — 전민변정도감을 설치하여 전국에 방을 내걸다', site: HDB, url: goryeo('kr_132r_0010_0010_0120') }],
  'js-sejong': [{ title: '『세종실록』 113권, 세종 28년 9월 29일 — 『훈민정음』이 이루어지다(어제 서문)', site: SILLOK, url: sillok('kda_12809029_004') }],
  'jl-sukjong': [{ title: '『숙종실록』 20권, 숙종 15년 2월 1일 — 송시열의 원자 관련 상소와 처벌(기사환국)', site: SILLOK, url: sillok('ksa_11502001_001') }],
  'gh-ganghwa': [{ title: '『고종실록』 13권, 고종 13년 2월 3일 — 신헌과 구로다가 수호 조규에 서명하다', site: SILLOK, url: sillok('kza_11302003_001') }],
  'gh-independence': [{ title: '『고종실록』 38권, 고종 35년 10월 30일 — 관민 공동회의 여섯 가지 강령(헌의 6조)', site: SILLOK, url: sillok('kza_13510030_002') }],
  'gh-daehan': [{ title: '『고종실록』 39권, 고종 36년 8월 17일 — 대한국 국제', site: SILLOK, url: sillok('kza_13608017_002') }],
  'gh-eulsa': [{ title: '『고종실록』 46권, 고종 42년 11월 17일 — 한일 협상 조약(을사늑약) 체결', site: SILLOK, url: sillok('kza_14211017_001') }],
  'hd-yushin': [
    {
      title: '대한민국헌법 제8호(1972.12.27. 전부개정, 유신 헌법)',
      site: '국가법령정보센터(법제처)',
      url: 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD%ED%97%8C%EB%B2%95/(00008,19721227)',
    },
  ],
};

export const primaryOf = (conceptId: string): PrimarySource[] => PRIMARY_SOURCES[conceptId] ?? [];
