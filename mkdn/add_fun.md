# add_fun (점수/스코어보드/로그인/관리자) 구현 가이드

목표: 사용자가 **플래그 제출**을 하면 서버가 정답을 검증하고, **점수/풀이 기록을 서버에 저장**하고, **스코어보드**에 반영되도록 만든다.

핵심 원칙: 점수/권한은 **프론트(JS)가 아니라 서버(Python/FastAPI)가 결정**한다.

---

## 결정 사항 (이 문서의 전제)

- 점수/풀이 여부는 서버 저장소에 기록한다.
- 플래그 검증은 `challenges.json`의 `flag_path` 파일을 서버가 읽어서 비교한다.
- 점수는 `challenges.json`의 `score` 값을 사용한다.
- 동일 문제는 **1회만 점수 반영**한다(중복 제출은 점수 증가 없음).
- 로그인 기반으로 사용자 식별을 한다.
- 토큰 기반 인증(`Authorization: Bearer <token>`)을 도입한다.
- 관리자 기능은 서버에서 `role=admin`만 접근 가능하게 막는다.
- 프론트는 파일을 분리한다(로그인 JS, 스코어보드 JS, 챌린지 JS 등).

---

## 백엔드 해야 할 일 (Python/FastAPI)

### 1) 사용자/인증
- 저장소: `data/users.json` (유저 데이터 + 점수 + solved 목록 저장)
- 신규 파일 추가:
- `auto_api/models.py`: 요청/응답 Pydantic 모델
- `auto_api/auth.py`: 유저 생성/인증/프로필/점수/solved 관리
- `auto_api/token.py`: 토큰 생성/검증

API (최소)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/auth/me`

동작
- 회원가입 성공 시 토큰 발급 + user 데이터 반환
- 첫 번째 회원가입자는 `role=admin`, 이후는 `role=user`

### 2) 플래그 제출 + 점수 반영
- 신규 API:
- `POST /submit`

요청
- `{ "problem": "pwn1", "flag": "HexaCTF{...}" }`

서버 동작
- 로그인 사용자 확인(토큰 검증)
- `challenges.json`에서 `problem` 조회
- `flag_path` 읽기(반드시 `dir` 기준 safe_join 처리)
- 제출 flag와 비교
- 정답이고 아직 안 풀었으면:
- `solved_problems`에 추가
- `score += challenge.score`

응답 예시
- `{ "status": "ok", "correct": true, "score": 150, "added": 100 }`

### 3) 스코어보드
- 신규 API:
- `GET /api/scoreboard`

서버 동작
- 유저 목록을 점수 내림차순(+ 필요 시 타이브레이크) 정렬
- `rank, username, display_name, score, solved_count` 형태로 반환

### 4) 기존 엔드포인트 보호(권한)
- 로그인 필수로 변경:
- `POST /start`
- `POST /stop/{instance_id}`
- `GET /api/download/{problem_key}/{file_index}`
- `POST /submit`
- `GET /api/scoreboard`

### 5) 관리자 API
- 신규 API:
- `GET    /api/admin/users`
- `DELETE /api/admin/users/{username}`
- `POST   /api/admin/users/{username}/role`
- `POST   /api/admin/scoreboard/reset`

서버 동작
- 토큰 role이 admin인지 검사(아니면 403)

---

## 프론트 해야 할 일 (JS 분리)

### 파일 분리(권장 구조)
- `static/app.js`: 엔트리. 부팅/탭 전환/각 모듈 init 호출
- `static/app-auth.js`: 로그인/회원가입, 토큰 저장/복구, 공통 API 호출 래퍼
- `static/app-challenges.js`: 기존 카드 렌더 + Start/Stop + (추가) 플래그 제출 UI
- `static/app-scoreboard.js`: 스코어보드 로드/렌더

### 공통 API 래퍼
- `app-auth.js`에 `apiFetch()`를 둔다.
- 동작:
- `Authorization: Bearer <token>` 자동 부착
- 401이면 로그인 화면으로 전환

### 플래그 제출 UI
- 각 카드에 입력창 + Submit 버튼 추가
- Submit 클릭 시 `POST /submit`
- 성공 시 카드에 Solved 표시, 내 점수/스코어보드 갱신

---

## challenges.json 추가 규칙

- 점수 반영을 위해 각 문제에 `score`가 있어야 한다.
- 플래그 검증을 위해 각 문제에 `flag_path`를 추가한다.
- `flag_path`는 `dir` 기준 상대경로를 권장한다.

예시
```json
"pwn1": {
  "title": "기초 버퍼 오버플로우",
  "dir": "/home/hexa/hexactf/challenges/pwn1",
  "type": "pwn",
  "category": "pwn",
  "score": 100,
  "port": 5001,
  "flag_path": "deploy/flag.txt",
  "downloads": [
    { "label": "prob", "path": "deploy/prob" }
  ]
}
```

---

## 구현 순서 (작업 순서)

1. `data/users.json` + `auto_api/auth.py/models.py/token.py` 생성
2. `auto_api/api.py`에 auth API 추가
3. `POST /submit` 구현(정답 검증 + 점수/solved 기록)
4. `GET /api/scoreboard` 구현
5. 기존 `/start`, `/stop`, `/download`, `/submit`, `/scoreboard`에 인증 적용
6. 프론트 분리(`app-auth.js`, `app-challenges.js`, `app-scoreboard.js`) + `index.html` UI 추가
7. 관리자 API + 관리자 화면 추가

---

## 완료 조건(체크)

- 로그인한 사용자만 `/submit` 호출 가능(미로그인 401)
- 정답 플래그 1회 제출 시에만 점수가 증가(중복 제출은 점수 변화 없음)
- `/api/scoreboard`에서 점수/순위가 즉시 반영됨
- 관리자 API는 admin만 접근 가능(user는 403)
