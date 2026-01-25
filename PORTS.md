# 포트 설정 문서 (challenges.json)

이 문서는 `challenges.json`의 `port` 필드가 **컨테이너 내부 포트**로만 사용되도록 변경된 현재 동작을 설명합니다.

## 요약
- `port`는 **컨테이너 내부에서 서비스가 리슨하는 포트**를 의미합니다.
- **호스트 포트는 자동으로 랜덤 선택**됩니다.
- `port`가 없으면 Dockerfile의 `EXPOSE` 값을 사용합니다.

## challenges.json 형식 예시
```json
{
  "pwn1": {
    "title": "기초 버퍼 오버플로우",
    "dir": "/home/hexa/hexactf/challenges/pwn1",
    "category": "pwn",
    "score": 100,
    "port": 5000
  }
}
```

## 동작 흐름 (쉽게 설명)
1) `/start` 요청이 들어오면 해당 챌린지 정보를 읽습니다.
2) `port`가 있으면 **그 값을 컨테이너 내부 포트**로 사용합니다.  
   없으면 Dockerfile의 `EXPOSE` 포트를 읽습니다.
3) 시스템이 **호스트 포트를 랜덤으로 배정**합니다.
4) 배정된 호스트 포트를 읽어 URL로 반환합니다.

## 왜 이렇게 했나요?
- 내부 포트는 문제 컨테이너에서 고정이므로 `challenges.json`에 명확히 적는 편이 안정적입니다.
- 외부 포트는 충돌을 피하기 위해 자동 할당이 안전합니다.

## 참고 파일
- 내부 포트 처리 로직: `auto_api/auto_deploy.py`
- API 흐름: `auto_api/api.py`
- 챌린지 정의: `challenges.json`
