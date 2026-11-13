// ============================================================
//  대회 설정 — 이 파일만 고치면 사이트 전체에 반영됩니다.
// ============================================================
window.CONFIG = {
  // 사이트 상단에 보이는 대회 이름 / 부제
  title: "동아리 마작 대회",
  subtitle: "2026 리치마작 리그",

  // 대회 기간 (YYYY-MM-DD). 상단에 D-day, 규칙 탭에 기간이 표시됩니다.
  startDate: "2026-11-16",
  endDate: "2026-12-04",

  // 구글 시트 → 파일 → 공유 → 웹에 게시 → (시트 선택) → CSV 로 게시한 URL
  // 비워두면 data/sample.csv(예시 데이터)를 보여줍니다.
  gamesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTg5w8bmi7Opdy-O7RoNfyNtWwIApgx58oPAJlUU3IKRtcq8MuB7WH8iKIdy-UCAAqcJOyDfxNXoytk/pub?gid=0&single=true&output=csv",

  // 랭킹 시작 점수 — 모두 이 점수를 갖고 시작해서 매 판의 pt가 더해지고 빠집니다.
  // (모두에게 똑같이 더해지므로 순위에는 영향 없음)
  basePoints: 500,

  // 배치 판수 — 이 판수 이상 친 선수부터 랭킹·시상 대상 (미만은 '배치 중'으로 표시)
  placementGames: 5,

  // 참가자 명단 — 같은 시트에 '선수' 탭을 만들고 A열에 이름을 적은 뒤, 그 탭을 CSV로 웹에 게시한 URL.
  // 비워두면 대국 기록에 나온 이름만 선수로 표시됩니다.
  playersCsvUrl: "",

  // 운영자 모드(사이트에서 기록 추가/삭제)용 Apps Script 웹 앱 주소.
  // apps-script/Code.gs 를 시트에 설치·배포한 뒤 나온 URL을 넣으세요. 비워두면 운영자 모드 꺼짐.
  adminApiUrl: "https://script.google.com/macros/s/AKfycbyCka5mu5twLs_5uo1xBXFXKmFRR44ItxSAfXxLHEOwtk5yYhgxn-1AQrESYAqAz1jisQ/exec",

  // 점수 규칙 (리치마작)
  startPoints: 25000,        // 배급 원점
  returnPoints: 30000,       // 반환점 (오카 = (반환점-원점)×4, 1위가 가져감)
  uma: [30, 10, -10, -30],   // 1~4위 우마 (단위: pt)

  // 랭킹 자동 새로고침 주기 (초). 0이면 끔
  refreshSeconds: 60,
};
