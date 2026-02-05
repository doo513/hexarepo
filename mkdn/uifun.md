# uifun (UI/페이지 분리 + 로그인 흐름) 요약

이 문서는 현재 프론트/라우팅 구조가 **어떻게 분리되어 있고**, **어떤 흐름으로 동작하는지**를 이해하기 쉽게 정리한 것입니다.

---

## 1) 화면 구조 (페이지 분리)

**이제 한 페이지가 아니라 4개의 페이지로 분리됨**
- `/login` → 로그인/회원가입 페이지
- `/challenges` → 문제 목록 페이지
- `/scoreboard` → 스코어보드 페이지
- `/admin` → 관리자 페이지

**HTML 위치**
- `static/pages/login.html`
- `static/pages/challenges.html`
- `static/pages/scoreboard.html`
- `static/pages/admin.html`

**기존 `static/index.html`**
- 루트 접속 시 `/login`으로 리다이렉트만 수행

---

## 2) 서버 라우팅 구조 (FastAPI)

**페이지 라우팅**
- `auto_api/routes_pages.py`
  - `/` → 로그인 페이지
  - `/login` → 로그인 페이지
  - `/challenges` → 문제 페이지
  - `/scoreboard` → 스코어보드 페이지
  - `/admin` → 관리자 페이지

**API 라우팅 (이미 분리됨)**
- `routes_auth.py` → `/api/auth/*`
- `routes_admin.py` → `/api/admin/*`
- `routes_scoreboard.py` → `/api/scoreboard`
- `routes_challenges.py` → `/api/challenges`, `/api/download/*`
- `routes_instances.py` → `/start`, `/stop/*`

**api.py 역할**
- 앱 생성 + static mount + 라우터 등록만 담당

---

## 3) 로그인/권한 흐름

**토큰 저장 위치**
- `localStorage.hexactf_token`
- `localStorage.hexactf_user`

**기본 동작**
1. 토큰이 없으면 `/login`으로 즉시 이동
2. 로그인 성공 시:
   - admin → `/admin`
   - user → `/challenges`
3. 일반 사용자가 `/admin` 접근 시 `/challenges`로 되돌림

이 흐름은 `static/js/app-router.js`에서 처리됨.

---

## 4) JS 구조 (기능별 분리)

- `static/js/app-core.js`
  - 공통 DOM, 상태, 유틸(escape, fetch, log 등)

- `static/js/app-auth.js`
  - 로그인/회원가입
  - 토큰 저장/복구
  - 로그인 성공 시 라우터로 이동 처리

- `static/js/app-router.js`
  - 토큰 유무 확인
  - 페이지 접근 가드
  - 관리자 링크 표시/숨김

- `static/js/app-challenges.js`
  - 문제 카드 렌더
  - Start/Stop, Copy 등

- `static/js/app-scoreboard.js`
  - 스코어보드 로드/렌더

- `static/js/app-admin.js`
  - 관리자 사용자 목록
  - 역할 변경 / 삭제
  - 스코어보드 초기화

- `static/js/app-main.js`
  - 페이지별 부팅 (challenges/scoreboard/admin 초기 로딩)

---

## 5) CSS 구조 (가독성 분리)

- `static/css/base.css` → 기본 변수/공통 색상/폰트/리셋
- `static/css/layout.css` → 레이아웃(탑바, 컨테이너, 히어로)
- `static/css/components.css` → 카드/버튼/패널 등 공용 컴포넌트
- `static/css/auth.css` → 로그인 UI 전용
- `static/css/scoreboard.css` → 스코어보드 테이블 전용
- `static/css/admin.css` → 관리자 테이블 전용

---

## 6) 현재 동작 요약

- **첫 접속**: 토큰 없으면 `/login`으로 이동
- **로그인 성공**:
  - admin이면 `/admin`
  - user면 `/challenges`
- **스코어보드**는 `/scoreboard`에서 별도 페이지로 열림
- **관리자 기능**은 `/admin`에서만 동작

---

## 7) 앞으로 작업할 때 참고

- 페이지 UI를 바꾸고 싶으면 `static/pages/*.html`
- 공통 스타일은 `static/css/base.css`, `layout.css`
- 특정 페이지 전용 스타일은 `static/css/*.css`
- 로그인/권한 동작 변경은 `app-auth.js` + `app-router.js`

