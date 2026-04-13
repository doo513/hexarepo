# WireGuard Gateway Notes

권장 주소 예시:

- EC2 `wg0`: `10.70.0.1/24`
- 내부 서버 `wg0`: `10.70.0.2/24`

필수 공개 포트:

- EC2 `51820/udp` for WireGuard
- EC2 `80/tcp`, `443/tcp` for the main site and web instances
- EC2 `33000-33049/tcp` for raw TCP instances

내부 서버 방화벽은 WireGuard 피어 IP만 허용하면 됩니다.

- `10.70.0.1 -> 8000/tcp`
- `10.70.0.1 -> 32000-32049/tcp`
- `10.70.0.1 -> 33000-33049/tcp`

적용 순서:

1. 양쪽에서 `wg genkey | tee private.key | wg pubkey > public.key`
2. 예시 파일을 바탕으로 `wg0.conf` 작성
3. `systemctl enable --now wg-quick@wg0`
4. EC2에서 `ping 10.70.0.2`, 내부 서버에서 `ping 10.70.0.1`
5. EC2 Nginx 적용
6. EC2에서 TCP forward 규칙 적용
7. 내부 서버 앱 환경 변수 적용 후 FastAPI 재시작

점검:

- EC2에서 `curl http://10.70.0.2:8000`
- EC2에서 `curl http://10.70.0.2:32000`
- 외부에서 `curl http://ctf.example.com`
- 외부에서 `nc -vz tcp.ctf.example.com 33000`
