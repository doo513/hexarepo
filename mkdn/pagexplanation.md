# pagexplanation

이 문서는 **/api/auth/me 500 에러 원인**, 관련 JS 흐름, 그리고 Docker SDK 변경의 이유를 설명합니다.

---

## 1) 에러 원인 요약

에러 메시지:
```
AttributeError: 'NoneType' object has no attribute 'lower'
```
발생 위치:
```
auto_api/auth.py -> get_user() -> username.lower()
```

### 핵심 원인
- 토큰 검증 단계에서 **username이 None으로 들어옴**
- `get_current_user()`가 `token_data['username']`을 기대하지만,
  **PyJWT 미설치 시 fallback 토큰은 `sub` 필드만 가짐**
- 결과적으로 username이 None → `None.lower()`로 폭발

### 해결
- `token.py`에서 fallback 검증 시 **`sub`를 `username`으로 변환해서 반환**하도록 수정
- `api.py`에서도 username이 비어 있으면 401 처리

---

## 2) 어떤 JS 파일이 관련있는가?

### 문제 발생 경로
1) **app-auth.js**
   - 로그인 완료 후 `authToken` 저장
   - 모든 API 요청에 `Authorization: Bearer <token>`를 붙임

2) **app-pages.js**
   - 페이지 이동 시 `/api/auth/me` 호출
   - 특히 **Profile 페이지 진입 시** `loadProfilePage()`가 실행
   - 여기서 토큰 검증 실패 → 서버에서 500 발생

### 관련 파일 요약
- `static/app-auth.js`
  - 로그인/회원가입/토큰 저장/헤더 주입
- `static/app-pages.js`
  - `/api/auth/me` 호출
  - 프로필/스코어보드/관리자 페이지 데이터 로딩
- `static/app-challenges.js`
  - 이번 에러와 직접 관련 없음 (챌린지 start/stop/submit 사용)

---

## 3) 관리자 계정/로그인 규칙 정리

### 기본 관리자
- **admin / admin** 자동 생성

### 일반 사용자 로그인 규칙
- 가입 시 입력: **이름, 전화번호, 이메일**
- 로그인 ID(username): **이메일**
- 비밀번호(password): **전화번호**

> 따라서 admin 계정은 **username=admin, password=admin**으로 로그인해야 함.

---

## 4) Docker SDK 변경은 꼭 필요한가?

### 내가 바꾼 이유
- `docker` 패키지가 설치되지 않은 환경에서
  **서버가 아예 뜨지 않는 문제**를 막기 위해서
- `auto_deploy.py`, `auto_stop.py`에서 **지연 import**로 변경

### 지금 Docker가 설치된 상태라면?
- **그대로 써도 문제 없음**
- 지연 import는 동작에 영향 없음
- 장점: Docker가 없는 환경에서도 **API 서버는 부팅 가능**

즉, **현재 상태 그대로 사용해도 안전함**.

---

## 5) 앞으로 수정할 때 참고

### 토큰 관련
- 파일: `auto_api/token.py`
- 확인 위치: `verify_token()`

### 프로필 API 호출
- 파일: `static/app-pages.js`
- 함수: `loadProfilePage()`

### 로그인/회원가입 규칙 변경
- 파일: `auto_api/api.py`의 `/api/auth/register`
- 파일: `static/index.html`, `static/app-auth.js`

---

필요하면 이 문서에 **에러 재현/테스트 절차**도 추가해줄 수 있음.
