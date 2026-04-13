# EC2 Gateway Setup

이 문서는 내부망에 있는 HexaCTF 서버를 외부 EC2 게이트웨이로 노출할 때의 최소 구성을 정리합니다.
기본 권장안은 `WireGuard`입니다.

## 권장 구조

- 내부 서버: FastAPI + Docker 인스턴스 실행
- EC2: 외부 공개용 게이트웨이
- 연결: `WireGuard`

흐름:

1. 사용자 -> EC2
2. EC2 -> 터널 -> 내부 서버
3. 내부 서버 -> Docker host port -> 컨테이너

## 내부 서버 설정

예시 환경 변수:

```env
HOST_URL=https://ctf.example.com
HOST_IP=gw.example.com
HEXACTF_HTTP_PORT_RANGE=32000-32049
HEXACTF_TCP_PORT_RANGE=33000-33049
HEXACTF_HTTP_URL_TEMPLATE=https://w-{port}.inst.example.com
HEXACTF_TCP_PUBLIC_HOST=tcp.ctf.example.com
```

의미:

- `HOST_URL`: 메인 서비스의 외부 주소
- `HEXACTF_HTTP_PORT_RANGE`: 웹 인스턴스에 쓸 Docker host port 범위
- `HEXACTF_TCP_PORT_RANGE`: `pwn/crypto` 인스턴스에 쓸 Docker host port 범위
- `HEXACTF_HTTP_URL_TEMPLATE`: 웹 인스턴스의 외부 노출 주소 템플릿
- `HEXACTF_TCP_PUBLIC_HOST`: TCP 인스턴스가 외부에 보일 호스트명

## 방화벽 권장

내부 서버에서는 EC2 터널 IP에서 오는 트래픽만 허용합니다.

- `8000/tcp`
- `32000-32049/tcp`
- `33000-33049/tcp`

## EC2 게이트웨이 역할

- `ctf.example.com:443` -> 내부 서버 `:8000`
- `w-<port>.inst.example.com:443` -> 내부 서버 `:<port>`
- `tcp.ctf.example.com:33000-33049` -> 내부 서버 동일 포트

실제 예시 설정은 아래 파일들을 참고하면 됩니다.

- [ops/wireguard/ec2-wg0.conf.example](/home/hexa/hexactf/ops/wireguard/ec2-wg0.conf.example)
- [ops/wireguard/internal-wg0.conf.example](/home/hexa/hexactf/ops/wireguard/internal-wg0.conf.example)
- [ops/nginx/ec2-gateway.conf.example](/home/hexa/hexactf/ops/nginx/ec2-gateway.conf.example)
- [ops/wireguard/ec2-tcp-forward.example.sh](/home/hexa/hexactf/ops/wireguard/ec2-tcp-forward.example.sh)

## challenge별 노출 방식

- `pwn`, `crypto`: 기본적으로 `tcp`
- 그 외 컨테이너형 문제: 기본적으로 `http`

필요하면 `challenges.json`에서 직접 지정할 수 있습니다.

```json
{
  "example": {
    "type": "misc",
    "access_mode": "tcp"
  }
}
```

허용 값:

- `http`
- `tcp`
- `web`
- `raw`
