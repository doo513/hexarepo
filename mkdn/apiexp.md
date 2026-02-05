# apiexp

이 문서는 **Docker SDK 방식으로 변경된 파일**, 그리고 **이후 추가 변경점**의 차이를 설명합니다.

---

## 1) Docker SDK 방식으로 바뀐 파일

### 대상 파일
- `auto_api/auto_deploy.py`
- `auto_api/auto_stop.py`

### SDK 방식의 특징
- `docker` 파이썬 SDK를 사용해 이미지 빌드/컨테이너 실행/종료를 처리
- 장점: 파싱 불필요, 에러 핸들링 쉬움, Python 코드 안에서 직접 제어
- 단점: **Python 패키지(docker) 설치 필요**

### 현재 코드 구조(요약)
- `auto_deploy.py`
  - `docker.from_env()`
  - `client.images.build(...)`
  - `client.containers.run(...)`
- `auto_stop.py`
  - `client.containers.get(...)`
  - `container.remove(force=True)`

---

## 2) 내가 SDK 방식으로 변경한 것과 “오늘 요청에 따른 변경” 차이

### A. 이전(또는 SDK 전환 시점) 핵심 변화
**변경 포인트**
- Docker CLI(`subprocess`) 대신 Python SDK 사용
- 이미지 빌드/컨테이너 실행/삭제를 Python 코드로 직접 처리

**효과**
- 로그 파싱/명령어 문자열 조합이 사라지고, Python API 기반으로 일관성 있음

---

### B. 오늘 변경한 추가 사항

#### 1) Docker SDK **지연 import**
파일: `auto_api/auto_deploy.py`, `auto_api/auto_stop.py`
- 서버 부팅 시 `docker` 패키지가 없으면 바로 죽던 문제 완화
- **실행 시점에만 import** → 없는 경우에도 API 서버는 뜰 수 있음

**차이 요약**
- 기존 SDK 방식: `import docker`가 파일 최상단
- 현재 방식: `deploy()`/`stop_container()` 안에서 import

#### 2) 인증/권한 흐름 변경
파일: `auto_api/api.py`, `auto_api/auth.py`, `auto_api/token.py`, `auto_api/models.py`, `static/js/*`
- 토큰 검증 로직 보완(`sub` → `username` 매핑)
- 관리자/일반 사용자 분리 + 스코어보드 접근 제한
- 인증 기반 API 호출 정리

**차이 요약**
- SDK 전환과는 별개로 **API 인증/권한 체계를 추가/수정**한 것

---

## 3) 지금 상태에서 무엇이 달라졌나?

### SDK 전환 당시와의 차이
- SDK 자체는 그대로 사용
- **지연 import로 안정성 증가**
- **인증/권한 로직 추가** (회원가입/로그인/관리자 기능)

즉, “SDK로 바꾼 것”과 “오늘 바꾼 것”은 성격이 다름:
- SDK 변경: **배포/컨테이너 관리 방식**
- 오늘 변경: **접근 제어/사용자 관리/안정성 보강**

---

## 4) 결론
- Docker가 설치된 환경이면 **현재 SDK 방식 그대로 사용해도 문제 없음**
- 지연 import는 기능 변화가 아니라 **서버 부팅 안정성 개선**
- 오늘 변경한 것은 **인증/권한 기능과 오류 방어 로직** 중심

---

## 5) 코드 비교 (요약 diff)

### 5-1. `auto_api/auto_deploy.py`

**(SDK 전환 전: subprocess/CLI 가정)**  
```python
subprocess.run(["docker", "build", "-t", image_name, problem_dir], check=True)
subprocess.run(["docker", "run", "-d", "-p", f\"{host_port}:{internal}\", "--name", container_name, image_name], check=True)
```

**(SDK 전환 후: Python SDK)**  
```python
client = docker.from_env()
client.images.build(path=problem_dir, tag=image_name, rm=True)
client.containers.run(
    image=image_name,
    detach=True,
    name=container_name,
    ports={f\"{internal}/tcp\": host_port},
)
```

**(오늘 변경: 지연 import 추가)**  
```python
try:
    import docker
    from docker.errors import DockerException, APIError
except ImportError as e:
    raise RuntimeError(\"Docker SDK not installed. Run: pip install docker\") from e
```

---

### 5-2. `auto_api/auto_stop.py`

**(SDK 전환 전: subprocess/CLI 가정)**  
```python
subprocess.run([\"docker\", \"rm\", \"-f\", container_name], check=True)
```

**(SDK 전환 후: Python SDK)**  
```python
client = docker.from_env()
container = client.containers.get(container_name)
container.remove(force=True)
```

**설명**
- `force=True`는 실행 중인 컨테이너도 강제로 제거하는 의미
- CLI의 `docker rm -f`와 동일한 동작을 SDK로 표현한 것

**(오늘 변경: 지연 import + SDK 미설치 메시지)**  
```python
try:
    import docker
    from docker.errors import DockerException, NotFound, APIError
    ...
except ImportError:
    return {\"status\": \"error\", \"error\": \"Docker SDK not installed. Run: pip install docker\"}
```

---

### 5-3. 인증 흐름 관련 (요약)

**토큰 fallback 수정 (token.py)**  
```python
username = data.get(\"sub\")
role = data.get(\"role\", \"user\")
return True, {\"username\": username, \"role\": role}
```

**`/api/auth/me` 보호 로직 (api.py)**  
```python
if not username:
    raise HTTPException(status_code=401, detail=\"Invalid token payload\")
```

---

### 5-4. 추가된 API (인증/관리자/스코어보드)

**인증**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/auth/me`

**스코어보드**
- `GET  /api/scoreboard`

**관리자**
- `GET    /api/admin/users`
- `POST   /api/admin/users/{username}/role`
- `DELETE /api/admin/users/{username}`
- `POST   /api/admin/scoreboard/reset`

---

### 5-5. api.py가 하는 일 (컨테이너 관련 외 추가된 역할)

**컨테이너/문제 관련 (기존)**
- `/start`, `/stop/{id}` 컨테이너 생성/종료
- `/api/challenges` 문제 목록 제공
- `/api/download/{problem_key}/{file_index}` 다운로드 제공

**인증/권한 (추가)**
- `get_current_user()` 토큰 검증 및 사용자 확인
- `get_admin_user()` 관리자 권한 검사
- `/api/auth/*` 회원가입/로그인/내 정보

**스코어보드 (추가)**
- `/api/scoreboard` 점수/순위 반환
- `/api/admin/scoreboard/reset` 전체 점수 초기화

**관리자 유저 관리 (추가)**
- `/api/admin/users` 사용자 목록
- `/api/admin/users/{username}/role` 권한 변경
- `/api/admin/users/{username}` 사용자 삭제

---

## 6) “SDK 변경” vs “권한/인증 변경” 차이 (자세히)

### A. SDK 변경 (가벼운 변경)
- 대상: `auto_api/auto_deploy.py`, `auto_api/auto_stop.py`
- 목적: `subprocess` 대신 **Python SDK로 컨테이너 제어**
- 범위: **배포/실행/종료 로직만 교체**
- 인증/회원/권한과는 **무관**

### B. 권한/인증 변경 (구조 변경)
- 대상: `api.py`, `auth.py`, `token.py`, `static/*.js`
- 핵심 내용:
  - 로그인/토큰 기반 인증
  - `/start`, `/stop`, `/submit`, `/download`, `/scoreboard` 접근 제어
  - 관리자/일반 사용자 분리
  - 토큰 검증 보완 (`sub` → `username`)
  - 정답 제출 시 solved 기록

**정리**
- SDK 변경 = **배포 방식 변경**
- 권한 변경 = **서비스 접근 구조 변경**

---

## 7) 실제 동작 흐름 (상세)

### 7-1. 컨테이너 실행 흐름 (SDK 기준)
1. **/start 요청**  
   프론트에서 `/start` 호출 → `auto_api/api.py`의 `start()` 실행
2. **문제 정보 로드**  
   `challenges.json`에서 문제 경로(`dir`), 내부 포트(`port`) 확인
3. **이미지 빌드** (`auto_deploy.deploy()`)  
   ```python
   client.images.build(path=problem_dir, tag=image_name, rm=True)
   ```
   - build context는 문제 폴더
   - 태그는 문제 폴더명 기반
4. **포트 매핑 + 컨테이너 생성**  
   ```python
   client.containers.run(
       image=image_name,
       name=container_name,
       ports={f"{internal}/tcp": host_port},
       detach=True
   )
   ```
   - 내부 포트는 문제가 실제 리슨하는 포트
   - 외부 포트는 30000~40000 랜덤
5. **URL 반환**  
   `http://<HOST>:<external_port>` 형태로 응답

### 7-2. 컨테이너 종료 흐름
1. `/stop/{instance_id}` 요청
2. `auto_stop.stop_container()` 호출
3. SDK에서 컨테이너 삭제:
   ```python
   container.remove(force=True)
   ```
   - 실행 중이어도 강제 제거

---

## 8) 인증/권한 흐름 (상세)

### 8-1. 회원가입 → 로그인 규칙
- 입력: `이름(name)`, `전화번호(phone)`, `이메일(email)`
- 저장 방식:
  - username = email
  - password = phone
  - display_name = name

### 8-2. 토큰 생성
- 로그인 성공 시 `TokenService.create_access_token()` 호출
- 토큰 payload:
  - `sub` = username (이메일)
  - `role` = user/admin

### 8-3. 토큰 검증
- `TokenService.verify_token()` 실행
- PyJWT가 없으면 fallback으로 base64 디코딩
- `sub` → `username` 변환 후 반환
- `get_current_user()`가 최종 사용자 확인

### 8-4. 관리자 분기
- `get_admin_user()` 호출 시 role 검사
- `role != admin`이면 403

---

## 9) 왜 SDK/권한 변경이 서로 다른 “레이어”인가?

### SDK 변경 = 인프라 레벨
- 컨테이너 빌드/실행/정지를 **어떻게 처리하느냐**
- 영향 범위: `auto_deploy.py`, `auto_stop.py`

### 권한 변경 = 서비스 레벨
- **누가 어떤 API를 호출할 수 있느냐**
- 영향 범위: `api.py`, `auth.py`, `token.py`, `static/*.js`

즉, SDK 변경은 “배포 엔진 교체”이고,  
권한 변경은 “서비스 접근 제어 추가”다.

---

## 10) 수정 시 빠른 가이드

### 컨테이너 동작 바꾸고 싶으면
- `auto_api/auto_deploy.py`, `auto_api/auto_stop.py`만 보면 됨

### 로그인/권한 규칙 바꾸고 싶으면
- `auto_api/api.py`의 `/api/auth/register`, `get_current_user()`
- `auto_api/token.py`의 `verify_token()`
- 프론트: `static/app-auth.js`

---

## 11) api.py 분리 구조 (가독성 개선)

`auto_api/api.py`는 이제 **앱 부팅/라우터 등록만 담당**합니다.

**분리된 라우터/유틸 파일**
- `auto_api/routes_auth.py` : `/api/auth/*`
- `auto_api/routes_admin.py` : `/api/admin/*`
- `auto_api/routes_scoreboard.py` : `/api/scoreboard`
- `auto_api/routes_challenges.py` : `/api/challenges`, `/api/download/*`
- `auto_api/routes_instances.py` : `/start`, `/stop/*`
- `auto_api/deps.py` : `get_current_user()`, `get_admin_user()`
- `auto_api/challenge_store.py` : challenges.json 로드/다운로드 처리
- `auto_api/state_store.py` : instances.json 로드/저장/ID 할당
