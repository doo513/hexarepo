# Fix 기록 (2026-02-05)

이번 요청에서 “패널 숨김 + 일반 유저 컨테이너 생성 제한 + 관리자가 제한값 조절”을 목표로 아래 수정/추가를 했습니다.

✅ 반영된 기능
- Challenges 페이지의 Console 패널 숨김
- 인증 기반으로 `/start`/`/stop` 보호 + 일반 유저 인스턴스 개수 제한(동시요청 레이스 방지 포함)
- Admin UI에서 “User instance limit” 조회/수정
- 새로고침 후에도 `/api/instances`로 실행중 인스턴스 복구(Stop 가능)
- 토큰을 localStorage에 저장하지 않도록 변경(HttpOnly 쿠키 사용) + `/api/auth/logout` 추가
- `users.json / instances.json / settings.json / secret.key` 파일 락 + atomic write 적용(동시접속으로 인한 파일 꼬임 방지)
- 비밀번호 해시 PBKDF2로 강화 + 기존(legacy) 해시는 로그인 시 자동 업그레이드
- `HEXACTF_SECRET` 미설정 시에도 `data/secret.key`로 안전하게 영구 시크릿 생성/사용

---

## 0) 변경 파일 목록(이번 작업 기준)

### 추가(신규)
- `api/settings_store.py` (설정 저장소: `data/settings.json`)
- `api/storage_utils.py` (파일 락/atomic write 유틸)
- `api/instances/service.py` (인스턴스 도메인 로직)
- `api/instances/runtime.py` (Docker deploy/stop 래퍼)
- `api/instances/store.py` (instances.json 접근 파사드)
- `api/instances/errors.py` (서비스 레이어 에러)
- `api/instances/__init__.py`
- `mkdn/fix.md` (이 문서)

### 수정
- Backend:
  - `api/routes_instances.py`, `api/routes_challenges.py`, `api/state_store.py`, `api/token.py`, `api/models.py`
  - `api/auth/auth.py`, `api/auth/deps.py`, `api/auth/routes_auth.py`, `api/auth/routes_admin.py`
  - `api/auto_api/auto_deploy.py`, `api/auto_api/auto_stop.py`
  - (정리) `api/api.py`, `api/routes_scoreboard.py`, `api/settings_store.py`, `api/storage_utils.py`
- Front:
  - `static/pages/challenges.html`, `static/pages/admin.html`, `static/pages/login.html`
  - `static/js/app-core.js`, `static/js/app-auth.js`, `static/js/app-router.js`, `static/js/app-admin.js`, `static/js/app-challenges.js`, `static/js/app-main.js`
  - `static/css/admin.css`

---

## 1) 프론트(UI) 변경

### (1) Challenges 페이지 Console 패널 숨김
- 파일: `static/pages/challenges.html`
- 변경: `<section class="panel"> ... <pre id="log"> ...` 블록 제거
- 영향: 화면에서 로그 패널이 사라짐. (로그는 DOM이 없으면 브라우저 콘솔로 출력됨)

### (2) API 응답 원문(raw) 로그 제거 (토큰/민감정보 노출 감소)
- 파일: `static/js/app-core.js`
- 변경: `safeJson()`에서 `HTTP ... raw: ...` 형태의 원문 출력 제거

### (3) 관리자 UI에 “User instance limit” 입력/저장 버튼 추가
- 파일: `static/pages/admin.html`
- 추가 요소:
  - `#userInstanceLimitInput` (number input)
  - `#saveUserInstanceLimitBtn` (Save 버튼)
- 파일: `static/css/admin.css`
  - `.admin-setting`, `.admin-input` 스타일 추가
- 파일: `static/js/app-core.js`
  - DOM 참조 추가: `userInstanceLimitInput`, `saveUserInstanceLimitBtn`
- 파일: `static/js/app-admin.js`
  - `/api/admin/settings`에서 설정 조회/저장 기능 추가
  - admin 로그인 시 `refreshSettings()` 자동 호출

### (4) 새로고침 후에도 실행중 인스턴스 복구(Stop 가능)
- 파일: `static/js/app-challenges.js`
  - `loadInstances()` 추가: `GET /api/instances`로 서버 상태를 받아 `state.runningMap` 동기화
  - Start/Stop 실패 메시지에서 `detail` 우선 사용 (FastAPI 에러 메시지 표시)
- 파일: `static/js/app-main.js`
  - challenges 페이지 부팅 시 `loadChallenges()` 후 `loadInstances()` 호출

### (5) 토큰 localStorage 저장 제거 + 세션 검증/로그아웃 추가
- 파일: `static/js/app-auth.js`
  - `hexactf_token` localStorage 저장 중단 (기존 키는 정리)
  - `refreshMe()` 추가: `GET /api/auth/me`로 쿠키 기반 세션 유효성 확인
  - `logout()` 추가: `POST /api/auth/logout` 호출 후 로컬 상태 정리
- 파일: `static/js/app-router.js`
  - 라우트 가드가 localStorage 토큰에 의존하지 않도록 수정(사용자 정보만 확인)
  - 상단 Logout 버튼이 `/api/auth/logout`도 호출하도록 수정
- 파일: `static/js/app-main.js`
  - 부팅 시 `refreshMe()`로 세션 검증(실패 시 `/login`으로 이동)
- 파일: `static/pages/login.html`
  - 로그인 페이지에도 `app-main.js` 로드 추가(쿠키 세션만 남아있는 경우 자동 리다이렉트 가능)

---

## 2) 백엔드(API) 변경

### (1) 일반 사용자당 컨테이너 생성 제한 + owner 기반 Stop 권한
- 파일: `api/routes_instances.py`
- 변경 내용:
  - `/start`는 인증 필수(Authorization 헤더 또는 HttpOnly 쿠키) (`get_current_user`)
  - **락을 잡고** limit 체크 + instance_id 할당 + `status=starting` 예약 저장 → 동시요청으로 limit/ID 우회 방지
  - 일반 user는 “현재 실행 중(owner==username, starting/running/stopping) 인스턴스 수”가 제한값 이상이면 `429` 반환
  - 일반 user는 같은 문제에 대해 중복 Start 시 `409` 반환
  - 인스턴스 state에 `owner`, `status` 저장 (running/stopping/error 포함)
  - `/stop/{id}`도 인증 필수 + (admin이 아니면) owner만 stop 가능 (`403` 방지)

### (2) 실행중 인스턴스 조회 API 추가
- 파일: `api/routes_instances.py`
- 추가: `GET /api/instances`
  - user: 본인(owner==username) 인스턴스만 반환
  - admin: 전체 인스턴스 반환(+ `owner` 포함)
  - 프론트 새로고침 시 running 상태 복구 용도
  - `status` 필드도 함께 반환(프론트 디버깅/운영 확인용)

### (3) “유저 인스턴스 제한값” 저장소 추가 (data/settings.json)
- 파일: `api/settings_store.py` (신규)
- 저장 위치: `data/settings.json`
- 환경변수:
  - `HEXACTF_USER_INSTANCE_LIMIT` (기본값, default: `2`)
  - `HEXACTF_MAX_USER_INSTANCE_LIMIT` (관리자 UI로 설정 가능한 최대치, default: `50`)

### (4) 관리자 API에 설정 조회/수정 엔드포인트 추가
- 파일: `api/models.py`
  - `SettingsUpdateRequest` 추가
- 파일: `api/auth/routes_admin.py`
  - `GET /api/admin/settings` 추가
  - `POST /api/admin/settings` 추가

### (5) challenges 목록에서 서버 절대경로(`dir`) 숨김
- 파일: `api/routes_challenges.py`
- 변경: `/api/challenges` 응답에서 `dir` 제거 (`ch.pop("dir", None)`)

### (6) instances.json 로딩 안정성 개선
- 파일: `api/state_store.py`
- 변경: JSON 깨짐/형식 오류 시 기본 상태로 fallback + `next_instance_id`/`instances` 타입 보정

### (7) Docker SDK가 없을 때 서버 전체가 죽지 않게 완화
- 파일: `api/auto_api/auto_deploy.py`, `api/auto_api/auto_stop.py`
- 변경: `docker` 모듈을 함수 내부에서 import (없으면 명확한 에러 메시지 반환/raise)

### (8) 파일 동시접속 레이스(권한/상태 꼬임) 방지: 락 + atomic write
- 파일: `api/storage_utils.py` (신규)
  - `exclusive_lock()` (POSIX flock 기반)
  - `atomic_write_json()/atomic_write_text()` (temp file → replace)
- 적용 파일:
  - `api/auth/auth.py` (`data/users.json`)
  - `api/state_store.py` (`instances.json`)
  - `api/settings_store.py` (`data/settings.json`)
  - `api/token.py` (`data/secret.key`)

### (9) 기본 관리자 계정 “계속 생성” 문제 개선
- 파일: `api/auth/auth.py`
- 변경:
  - 기존: `admin` 계정이 없으면 무조건 `admin/admin` 생성
  - 변경: **“관리자 계정이 하나도 없을 때만”** 기본 관리자 생성
  - 환경변수로 초기 관리자 설정 가능:
    - `HEXACTF_ADMIN_USERNAME` (default: `admin`)
    - `HEXACTF_ADMIN_PASSWORD` (default: `admin`)

### (10) 비밀번호 해시 강화(PBKDF2) + 자동 마이그레이션
- 파일: `api/auth/auth.py`
- 변경:
  - 신규 저장 포맷: `pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>`
  - 기존 legacy 포맷(`salt$sha256(...)`)은 로그인 성공 시 자동으로 PBKDF2 포맷으로 업그레이드
  - iterations 환경변수: `HEXACTF_PBKDF2_ITERATIONS` (default: `200000`)

### (11) 토큰 시크릿(HEXACTF_SECRET) 영구화
- 파일: `api/token.py`
- 변경:
  - `HEXACTF_SECRET`가 없으면 `data/secret.key`를 생성해서 HMAC 시크릿으로 사용(재시작해도 토큰 검증 유지)
  - 동시 실행 시에도 안전하도록 락 적용

### (12) 인증 쿠키 지원 + 로그아웃 API
- 파일: `api/auth/routes_auth.py`, `api/auth/deps.py`
- 변경:
  - `/api/auth/login`, `/api/auth/register`에서 `hexactf_token` HttpOnly 쿠키 설정
  - `/api/auth/logout` 추가(쿠키 삭제)
  - 서버는 `Authorization: Bearer ...`가 없으면 쿠키에서 토큰을 읽어 인증

### (13) 다운로드 인증 요구
- 파일: `api/routes_challenges.py`
- 변경: `/api/download/...`는 로그인(인증) 필수로 변경

---

## 3) 동작 요약 (변경 후)

- 일반 유저:
  - `/start`는 로그인 토큰 필요
  - 동시에 띄울 수 있는 인스턴스 수는 “User instance limit”에 의해 제한
  - 본인이 만든 인스턴스만 `/stop/{id}` 가능
- 관리자(admin):
  - 제한 없이 `/start` 가능
  - 모든 인스턴스를 stop 가능
  - Admin 페이지에서 “User instance limit” 값을 저장하면 `data/settings.json`에 반영됨
- 새로고침:
  - 프론트가 `GET /api/instances`로 상태를 다시 읽어 “Running/Stop 버튼” 상태를 복구함

---

## 3-1) API 변경 요약(필수 헤더/신규 엔드포인트)

### 인증 필요 (Authorization 헤더 또는 HttpOnly 쿠키)
- `POST /start` (일반 유저는 인스턴스 제한 적용, 초과 시 `429`, 중복 시 `409`)
- `POST /stop/{instance_id}` (일반 유저는 owner만 가능)
- `GET /api/instances` (일반 유저는 본인 것만 반환)
- `GET /api/auth/me`
- `GET /api/download/{problem_key}/{file_index}`

### 관리자 전용
- `GET /api/admin/settings`
- `POST /api/admin/settings` (`{"user_instance_limit": 3}` 형태)

### 인증(쿠키) 관련
- `POST /api/auth/login` (쿠키 설정)
- `POST /api/auth/register` (쿠키 설정)
- `POST /api/auth/logout` (쿠키 삭제)

### 응답 변경
- `GET /api/challenges`: `dir` 필드를 더 이상 내려주지 않음

---

## 3-2) settings.json

- 저장 파일: `data/settings.json` (Admin UI에서 Save 누를 때 생성/갱신)
- 예시:
```json
{ "user_instance_limit": 2 }
```
- 관련 환경변수:
  - `HEXACTF_USER_INSTANCE_LIMIT` (기본값, default: `2`)
  - `HEXACTF_MAX_USER_INSTANCE_LIMIT` (UI로 설정 가능한 최대치, default: `50`)

---

## 3-3) 빠른 테스트 시나리오

1. `admin/admin`으로 로그인 → `/admin`
2. “User instance limit”을 `1`로 설정 후 Save
3. 일반 계정으로 로그인 → `/challenges`
4. 인스턴스 1개 Start 성공 후, 다른 문제를 Start 시도 → `Instance limit reached (1)...` 메시지 확인
5. Stop 후 다시 Start 가능 확인
6. 페이지 새로고침 후에도 Stop 버튼 상태가 유지되는지 확인

---

## 4) (추가) API 모듈 연결/구조 정리

요청하신 “권한/인증은 권한대로, 컨테이너 생성은 그쪽대로” 정리를 위해, 실제 코드도 아래 방향으로 분리했습니다(기능 변화는 최소).

### (4-1) import/경로 꼬임 정리
- 공용 유틸을 `api/storage_utils.py`로 올려서 전역에서 사용
- 설정 저장소를 `api/settings_store.py`로 올려서 전역에서 사용
- FastAPI app 연결을 실제 파일 위치에 맞게 수정: `api/api.py`가 도메인 라우터를 직접 include
- `api/auth/auth.py`의 `data/` 경로 계산을 수정(항상 repo 루트의 `data/` 사용)

### (4-2) 도메인별 디렉토리로 분리
- Instances(컨테이너/인스턴스):
  - 라우터: `api/instances/routes.py`
  - 서비스: `api/instances/service.py`
  - 런타임(docker): `api/instances/runtime.py`
  - 저장소 파사드: `api/instances/store.py`
  - 호환용 re-export: `api/routes_instances.py`
- Challenges(문제/다운로드):
  - 라우터: `api/challenges/routes.py`
  - 스토어: `api/challenges/store.py`
  - 호환용 re-export: `api/routes_challenges.py`, `api/challenge_store.py`
- Pages(HTML 서빙):
  - 라우터: `api/pages/routes.py`
  - 호환용 re-export: `api/routes_pages.py`
- Scoreboard:
  - 라우터: `api/scoreboard/routes.py`
  - 호환용 re-export: `api/routes_scoreboard.py`

## 5) 이번 수정에서 ‘아직’ 손대지 않은 보안/구조 이슈(메모)

이번에 큰 축은 정리했지만, 아래는 추가로 고려하면 좋은 포인트:
- 쿠키 인증 CSRF 방어는 추가했지만(아래 참고), 운영 환경에 따라 SameSite/도메인/프록시 설정까지 함께 점검 필요
- `access_token`은 **옵션으로 응답 바디에서 숨길 수 있게** 했지만(기본은 유지), 완전 비노출 정책이면 기본값도 바꾸는 것을 권장
- 파일 기반 저장소는 락/atomic write로 안정성은 올렸지만, 규모가 커지면 DB 도입 고려

---

## 6) (추가) CSRF 방어 + access_token 옵션화

### (6-1) CSRF (Double-submit cookie)
- 쿠키 인증(Authorization Bearer 미사용) 상태에서 **POST/DELETE** 요청은 `X-CSRF-Token` 헤더가 필요합니다.
- 서버는 `hexactf_csrf` 쿠키와 `X-CSRF-Token` 헤더가 일치해야 통과합니다.
- 반영 파일:
  - 서버: `api/auth/deps.py` (`require_csrf`), `api/auth/routes_auth.py`, `api/auth/routes_admin.py`, `api/instances/routes.py`
  - 프론트: `static/js/app-core.js`(csrf 읽기), `static/js/app-auth.js`, `static/js/app-admin.js`, `static/js/app-challenges.js`

### (6-2) access_token 응답 바디 옵션
- 환경변수 `HEXACTF_RETURN_ACCESS_TOKEN`로 `/api/auth/login`, `/api/auth/register` 응답 바디의 `access_token` 포함 여부를 조절합니다.
  - 기본: `1`(기존 호환 유지)
  - 비노출: `0` (쿠키만 사용)

### (6-3) Login CSRF(세션 고정) 완화
- `/api/auth/login`, `/api/auth/register`는 쿠키를 새로 설정(Set-Cookie)하므로, 브라우저 기준으로는 “다른 사이트에서 로그인/회원가입 요청을 날려 세션을 바꿔치기”하는 시도가 가능합니다.
- 이를 완화하기 위해 `Origin`/`Referer`가 있는 요청은 **same-origin**만 허용하도록 체크를 추가했습니다.
  - 파일: `api/auth/routes_auth.py` (`require_same_origin`)
