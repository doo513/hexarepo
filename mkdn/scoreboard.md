# Scoreboard UI 구현 기록

## 목표
- 기본적인 스코어보드 화면을 추가하고, `GET /api/scoreboard`가 준비되면 자동으로 데이터를 렌더하도록 구성.
- 백엔드가 없더라도 화면이 보이도록 **fallback 데이터**를 사용.

---

## 변경 파일
- `static/index.html`
- `static/style.css`
- `static/js/app-core.js`
- `static/js/app-scoreboard.js`
- `static/js/app-nav.js`
- `static/js/app-main.js`

---

## HTML 구성 (`static/index.html`)
- 네비게이션에 `data-page`를 추가하여 탭 전환 기반으로 동작하도록 변경.
- 페이지 섹션을 `.page` 단위로 분리:
  - `data-page="challenges"` (기존 화면)
  - `data-page="scoreboard"` (신규)
  - `data-page="mypage"` (플레이스홀더)
- 스코어보드 테이블 구조:
  - `#scoreboardBody`에 데이터 렌더
  - `#scoreboardStatus`에 API 상태 표시
  - `#refreshScoreboardBtn`로 수동 새로고침

---

## CSS 추가 (`static/style.css`)
- `.page`, `.page.active`로 탭 전환 시 섹션 표시 제어
- `.scoreboard-table` 및 관련 클래스 추가
  - 테이블 기본 스타일, hover, empty 상태 스타일

---

## JS 로직 (분리 구조)

### 1) 탭 전환
- `.nav-link[data-page]` 클릭 시 `showPage(page)` 호출
- 선택된 페이지에만 `.active` 부여

### 2) 스코어보드 로딩
- `loadScoreboard()` (파일: `static/js/app-scoreboard.js`)
  - `GET /api/scoreboard`
  - 로그인 토큰이 있으면 `Authorization` 헤더 자동 첨부
  - 실패 시 fallback 데이터 사용
  - 정렬: 점수 내림차순
- `renderScoreboard(rows)`
  - 테이블 바디에 렌더링

### 3) 초기 동작
- 부팅 시 `showPage("challenges")`로 기본 탭 고정
- 스코어보드 탭 클릭 시 자동 로드
- `Refresh` 버튼으로 수동 재로드 가능

---

## 백엔드 연동 시 기대 응답
```json
{
  "status": "ok",
  "scoreboard": [
    {
      "rank": 1,
      "username": "guest01",
      "display_name": "Guest 01",
      "score": 250,
      "solved_count": 5
    }
  ]
}
```

---

## 메모
- 현재는 UI만 준비된 상태.
- 실제 점수 반영/로그인/권한 기능은 `auto_api/api.py` 쪽 구현이 필요.
- JS는 `static/js/`로 분리되어 로드됨. (`static/app.js`는 사용하지 않음)
- 스코어보드 초기화는 관리자 패널(`My Page`)에서 실행되도록 구성됨.
