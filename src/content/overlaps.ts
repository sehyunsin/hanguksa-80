// 문제 생성기의 오답 재료 예외 목록. scripts/audit-questions.ts 가 찾은 ‘다른 개념에도 해당할 수 있는 사실’을
// 사람이 읽고 판단한 결과(2026-11-27). tests/audit.test.ts 가 점검 결과와 이 목록이 어긋나지 않는지 확인한다.

/**
 * 이 사실(키)은 값의 개념에도 맞는 설명이거나, 맞는다고 볼 여지가 있음.
 * → 그 개념의 오답 선택지·OX 거짓 문장·‘옳지 않은 것’ 정답으로 쓰지 않고,
 *   ‘누구(무엇)인가’ 문제에서 그 개념을 오답 후보로 쓰지 않으며, 비교·짝 맞추기에서 함께 쓰지 않는다.
 */
export const ALSO_TRUE: Record<string, string[]> = {
  'sl-naemul#1': ['sl-jijeung'], // 왕의 칭호로 마립간 사용 — 지증왕도 즉위 초 마립간으로 불림
  'sam-hwangsan#1': ['hu-unification'], // ‘이 전투 직후 백제 멸망’ — 일리천 전투 직후 후백제 멸망과 헷갈림
  'js-taejong#3': ['jl-yeongjo'], // 신문고 설치 — 영조가 다시 설치
  'jl-jeongjo#3': ['jl-jeongyakyong'], // 수원 화성 축조 — 정약용이 설계·거중기
  'jl-bakjiwon#2': ['jl-bakjega'], // 수레·선박 이용 강조 — 박제가도 『북학의』에서 강조
  'gh-eulsa-uibyeong#2': ['gh-wijeong'], // 최익현의 태인 의병 — 위정척사 운동이 항일 의병으로 이어짐
  'gh-facilities#4': ['gh-press'], // 박문국의 한성순보 발행 — 근대 신문 발행에도 해당
  'th-dokdo#2': ['gh-dokdo'], // 칙령 제41호
  'gh-dokdo#0': ['th-dokdo'],
  'gh-dokdo#1': ['th-dokdo'], // 시마네현 고시
  'gh-sinminhoe#0': ['ij-gwangbokhoe'], // 공화정체 국가 수립 목표 — 대한 광복회도 공화주의
  'ij-gwangbokgun#2': ['ij-kpg-chongqing'], // 충칭에서 정규군 창설 — 충칭 임시 정부의 활동
  'ij-gwangbokgun#3': ['ij-joseondoknipdongmaeng'], // 조선 의용대 일부 합류 — 조선 의용군도 의용대(화북지대)에서 개편
  'ij-bongodong#0': ['ij-cheongsanri'], // 홍범도의 대한 독립군 — 청산리 전투에도 참가
  'ij-3bu#2': ['ij-joseonhyeokmyeong'], // 남만주 국민부 성립 — 조선 혁명군은 국민부 소속
  'ij-hangukdoknip#0': ['ij-gwangbokgun'], // 지청천 총사령관 — 한국 광복군 총사령관도 지청천
  'hd-namBuk#2': ['hd-jwau'], // 단독 정부 수립 반대
  'hd-jeju#0': ['hd-yeosun'], // 진압 과정의 민간인 희생
  'hd-518#1': ['hd-419'], // 유네스코 세계 기록 유산 — 4·19 혁명 기록물도 2023년 등재
};

/**
 * 점검에 걸렸지만 대상 개념에는 분명히 틀린 설명이라 그대로 쓰는 조합(‘사실 ID>개념 ID’).
 * 예: 최우의 정방 설치 → 최충헌, 의천의 교선 통합 → 지눌 — 기출의 대표적 구별 포인트.
 */
export const CHECKED_FALSE: string[] = [
  // 문무왕의 ‘고구려를 멸망시켰다’ — 고구려 왕·신라 이전 왕 등 설명에 ‘고구려’가 나올 뿐
  'ns-munmu#1>gg-gogukcheon',
  'ns-munmu#1>gg-micheon',
  'ns-munmu#1>gg-sosurim',
  'ns-munmu#1>gg-gwanggaeto',
  'ns-munmu#1>gg-jangsu',
  'ns-munmu#1>bj-geunchogo',
  'ns-munmu#1>bj-seong',
  'ns-munmu#1>sl-naemul',
  'ns-munmu#1>sl-jinheung',
  'ns-munmu#1>sl-seondeok',
  'ns-munmu#1>sl-muyeol',
  'ns-munmu#1>bh-daejoyeong',
  'ns-munmu#1>hu-gungye',
  'ns-munmu#1>gr-taejo',
  // 기출의 구별 포인트(대상에는 분명히 틀림)
  'bj-geunchogo#1>gg-sosurim', // 고국원왕을 전사시킨 것은 근초고왕(소수림왕은 그 아들)
  'sl-jinheung#5>sl-seondeok', // 황룡사 창건은 진흥왕, 선덕 여왕은 9층 목탑
  'ns-sinmun#3>ns-gyeongdeok', // 경덕왕은 녹읍 부활
  'sl-beopheung#1>gr-gwangjong', // 광종의 연호는 광덕·준풍
  'gr-choewoo#0>gr-choechungheon', // 정방은 최우
  'gr-choewoo#1>gr-choechungheon', // 서방은 최우
  'js-taejong#2>gr-choechungheon', // 최충헌은 도방 확대
  'gr-jinul#3>gr-uicheon', // 의천은 교종 중심 통합
  'gr-uicheon#3>gr-jinul', // 지눌은 선종 중심 통합
  'gr-samgukyusa#1>gr-samguksagi', // 단군 이야기는 『삼국유사』
  'gr-samguksagi#2>gr-jikji', // 직지는 현존 최고 금속 활자본(역사서 아님)
  'js-sejo#1>js-seongjong', // 성종은 경연 활성화·홍문관
  'gr-leejagyeom#1>js-eulsa', // 고려 인종·이자겸
  'js-injo#0>js-gwanghaegun', // 광해군은 인조반정으로 폐위
  'jl-jeongjo#0>jl-bakjega', // 규장각 설치는 정조(박제가는 검서관)
  'jl-jeongjo#0>jl-yudeukgong', // 규장각 설치는 정조(유득공은 검서관)
  'gh-jeongmi-uibyeong#0>gh-jeongmi', // 조약이 아니라 정미의병의 설명
  'gh-eulsa#1>gh-gukchae', // 통감부 설치는 을사늑약
  'ij-mudan#0>ij-munhwa', // 문화 통치는 보통 경찰제
  'ij-munhwa#2>ij-malsal', // 민족 말살 통치기에는 폐간
  'hd-namBuk#2>hd-misogongwi', // 정읍 발언은 단독 정부 수립 주장
  'hd-namBuk#0>hd-510', // 남북 협상파는 5·10 총선거 불참
  'hd-419#2>hd-balchwe', // 이승만 하야는 4·19 혁명
];
