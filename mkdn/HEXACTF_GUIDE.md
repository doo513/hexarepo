# HexaCTF 운영/개발 가이드

이 문서는 현재 HexaCTF의 **문제 등록, 컨테이너 실행, 다운로드, 플래그 제출** 흐름을 한 번에 이해할 수 있도록 정리한 안내서입니다.

---

## 1) 전체 흐름 요약

1. **challenges.json**에 문제 정보를 등록
2. 프론트가 **/api/challenges**를 불러와 카드 렌더링
3. **Start Instance** 클릭 시 `/start` 호출
   - Dockerfile이 있거나 `deploy: "docker"`면 컨테이너 생성
   - 그렇지 않으면 컨테이너 없이 준비 상태로 처리
4. 다운로드 버튼은 `/api/download/...`로 파일 제공
5. 플래그 제출은 `/submit`에서 맞으면 OK 처리

---

## 2) 문제 등록 파일: `challenges.json`

### 핵심 필드 정리

- `challenge_id`: 내부 식별자
- `title`: 문제 제목
- `dir`: 문제 폴더 절대 경로
- `category`: 분류 (pwn/web/rev/misc/forensic/crypto)
- `type`: 실제 동작 분류 (프론트 연결 방식에 사용)
- `score`: 점수
- `port`: **컨테이너 내부 포트**
- `deploy`: `docker` or `none`
  - `docker`: 컨테이너 생성
  - `none`: 컨테이너 없이 문제 제공
- `downloads`: 다운로드 파일 목록 (로컬 분석용)
- `flag_path`: 플래그 파일 경로 (상대경로 가능)

### 예시

```json
"pwn_baseball_game": {
  "challenge_id": "baseball_game",
  "title": "Baseball Game",
  "dir": "/home/hexa/HexaCTF_Challenges/PW/baseball_game/public",
  "category": "pwn",
  "type": "pwn",
  "score": 100,
  "port": 10010,
  "deploy": "docker",
  "flag_path": "deploy/flag",
  "downloads": [
    { "label": "prob", "path": "deploy/prob" },
    { "label": "prob.c", "path": "deploy/prob.c" },
    { "label": "libc.so.6", "path": "deploy/libc.so.6" }
  ]
}
```

---

## 3) 컨테이너 생성 기준

### 자동 판단 규칙
- `deploy: "docker"` → 무조건 생성
- `deploy: "none"` → 생성 안함
- 없으면 → `dir/Dockerfile` 존재 여부로 판단

### 내부 포트 규칙
- `challenges.json`의 `port`는 **컨테이너 내부 포트**
- 호스트 포트는 자동으로 랜덤 배정
- 반환 URL은 `http://192.168.0.163:<external_port>` 형태

---

## 4) 연결 방법 표시 (문제 유형)

프론트에서 **type/category** 기반으로 출력 방식이 결정됩니다.

- `pwn`: `nc <host> <port>` 형태로 표시
- `web`: URL 그대로 표시
- `rev` / `forensic` / `misc`: URL 대신 다운로드 기반 안내

---

## 5) 다운로드 기능

- `downloads`에 지정된 파일이 카드에 표시됨
- `/api/download/{problem_key}/{file_index}`로 다운로드
- 파일 존재 여부 체크 후 제공

예시:

```json
"downloads": [
  { "label": "prob", "path": "deploy/prob" }
]
```

---

## 6) 플래그 제출

### API
`POST /submit`

```json
{ "problem": "pwn1", "flag": "HexaCTF{...}" }
```

### 동작
- `flag_path`에 있는 파일을 읽어 제출값과 비교
- 맞으면 `correct: true` 반환

---

## 7) 실전 운영 팁

- `deploy: "none"` 문제는 Start/Stop이 비활성 처리됨
- `downloads` 없으면 다운로드 섹션이 표시되지 않음
- `flag_path`가 없으면 플래그 제출 시 오류 메시지 반환

---

## 8) 현재 등록된 문제 (HexaCTF_Challenges)

- pwn: Basic_ROP, baseball_game
- web: villa, SSTI, Utilizing LFI
- rev: 250212 zip
- forensic: easy_android, divide, easy_forensic
- misc: lunch-maze (server Docker 기반)

---

필요하면 이 문서를 더 간단한 버전(운영자용/출제자용)으로도 분리해줄게.
