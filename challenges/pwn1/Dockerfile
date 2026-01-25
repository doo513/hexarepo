FROM ubuntu:22.04

# 환경 변수
ENV user hackerlogin
ENV chall_port 5001

# 패키지 업데이트 및 socat 설치
RUN apt-get update && apt-get -y install socat

# CTF용 사용자 생성
RUN adduser --disabled-password --gecos "" $user

# 문제 파일 복사
ADD ./deploy/flag.txt /home/$user/flag.txt
ADD ./deploy/prob /home/$user/prob

# 권한 설정 (CTF 보안 기준)
RUN chown root:$user /home/$user/flag.txt && \
    chown root:$user /home/$user/prob

RUN chmod 440 /home/$user/flag.txt && \
    chmod 755 /home/$user/prob

# 실행 위치 및 권한 전환
WORKDIR /home/$user
USER $user

# 내부 포트 (auto_deploy.py가 이거 읽음)
EXPOSE $chall_port

# 문제 바이너리 실행 (TCP)
CMD socat -T 90 TCP-LISTEN:$chall_port,reuseaddr,fork EXEC:/home/$user/prob
