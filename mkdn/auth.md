# auth (로그인/권한/관리자) 구현 기록

## 목표
- 로그인 UI를 추가하고, 서버에서 사용자/관리자를 분리하는 권한 API를 만든다.
- 기본 관리자 계정은 `admin/admin`으로 고정한다.

---

## 변경 파일
- `auto_api/api.py`
- `auto_api/auth.py`
- `auto_api/token.py`
- `auto_api/models.py`
- `static/index.html`
- `static/style.css`
- `static/js/app-core.js`
- `static/js/app-auth.js`
- `static/js/app-nav.js`
- `static/js/app-main.js`
- `static/js/app-admin.js`

---

## 서버 구조

### 사용자 저장소
- 파일: `data/users.json` (서버가 자동 생성)
- 구조: `{"users": {"username": {...}}}`

### 기본 관리자
- 서버 시작 시 `admin/admin` 계정을 자동 생성
- 첫 실행에서만 생성되며, 이미 존재하면 유지

### 토큰 방식
- 간단한 HMAC 서명 토큰
- `Authorization: Bearer <token>` 헤더로 인증

---

## 신규 API

### 1) 회원가입
`POST /api/auth/register`

요청
```
{
  "username": "hacker123",
  "password": "secret",
  "display_name": "해커123"
}
```

응답
```
{
  "status": "ok",
  "access_token": "...",
  "token_type": "bearer",
  "user": {
    "username": "hacker123",
    "display_name": "해커123",
    "role": "user",
    "score": 0,
    "solved_problems": []
  }
}
```

### 2) 로그인
`POST /api/auth/login`

요청
```
{
  "username": "admin",
  "password": "admin"
}
```

응답
```
{
  "status": "ok",
  "access_token": "...",
  "token_type": "bearer",
  "user": { "username": "admin", "role": "admin" }
}
```

### 3) 내 정보
`GET /api/auth/me`
- 헤더에 `Authorization: Bearer <token>` 필요

---

## 관리자 API

### 사용자 목록
`GET /api/admin/users`

### 사용자 권한 변경
`POST /api/admin/users/{username}/role`

요청
```
{ "role": "admin" }
```

### 사용자 삭제
`DELETE /api/admin/users/{username}`

### 스코어보드 초기화
`POST /api/admin/scoreboard/reset`

---

## 프론트 UI

### 위치
- `My Page` 탭에 로그인/회원가입 UI 추가
- `My Page` 탭 하단에 관리자 패널 추가(관리자만 표시)

### 동작
- 로그인 성공 시 토큰과 유저 정보를 `localStorage`에 저장
- 로그아웃 시 저장 데이터 삭제
- 상단 우측에 현재 사용자 표시
- JS는 `static/js/`로 분리됨 (app-core/app-auth/app-nav/app-main)
- 관리자 패널:
  - 사용자 목록 로드/갱신
  - 권한 변경(관리자/사용자)
  - 사용자 삭제(마지막 관리자 삭제/강등은 서버에서 차단)
  - 스코어보드 초기화

### 저장 키
- `localStorage.hexactf_token`
- `localStorage.hexactf_user`

---

## 메모
- 현재는 인증/권한 API만 추가되어 있으며, 점수 반영이나 플래그 제출은 별도 구현 필요
- `/start`, `/stop`, `/download`, `/submit`에 인증 강제는 아직 적용하지 않음
- `static/app.js`는 더 이상 로드되지 않음 (분리된 JS로 대체)
