import os
import random
import re

import docker
from docker.errors import DockerException, APIError

MIN_HOST_PORT = 30000
MAX_HOST_PORT = 40000
MAX_PORT_TRIES = 30

def get_internal_port(dockerfile_path):
    with open(dockerfile_path, encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"EXPOSE\s+(\d+)", content)
    return int(m.group(1)) if m else 5000

def deploy(problem_dir, instanceid, port=None):
    problem_dir = os.path.abspath(problem_dir) # 문제 경로 

    dockerfile_path = os.path.join(problem_dir, "Dockerfile") # 경로 디렉토리 내 도커 파일 찾기
    if not os.path.exists(dockerfile_path):
        raise FileNotFoundError(f"Dockerfile not found in {problem_dir}")

    # 이미지 이름
    problem_name = os.path.basename(problem_dir)
    image_name = f"{problem_name}".lower()

    # 포트는 challenges.json 값(컨테이너 내부 포트) 우선, 없으면 Dockerfile EXPOSE 사용
    if port is None:
        internal = get_internal_port(dockerfile_path)
    else:
        internal = int(port)

    try:
        client = docker.from_env()

        # 🔥 핵심: build context는 반드시 문제 폴더여야 한다!!
        client.images.build(path=problem_dir, tag=image_name, rm=True)

        container_name = f"{image_name}_{instanceid}"

        container = None
        host_port = None
        last_error = None
        for _ in range(MAX_PORT_TRIES):
            host_port = random.randint(MIN_HOST_PORT, MAX_HOST_PORT)
            try:
                container = client.containers.run(
                    image=image_name,
                    detach=True,
                    name=container_name,
                    ports={f"{internal}/tcp": host_port},
                )
                break
            except APIError as e:
                last_error = e
                msg = str(e).lower()
                # 포트 충돌일 때만 재시도
                if "port is already allocated" in msg or "address already in use" in msg or "bind" in msg:
                    continue
                raise

        if not container:
            raise RuntimeError(f"Failed to allocate host port after {MAX_PORT_TRIES} tries: {last_error}")
        # 포트 할당 정보는 즉시 반영되지 않을 수 있어 reload 필요
        container.reload()

        ports = container.attrs.get("NetworkSettings", {}).get("Ports", {})
        binding = (ports.get(f"{internal}/tcp") or [])
        if not binding:
            raise RuntimeError("Host port not assigned for container")
        external = int(binding[0].get("HostPort") or host_port)

        return {
            "container_name": container_name,
            "image_name": image_name,
            "external_port": external,
            "internal_port": internal,
            "id" : instanceid
        }
    except (DockerException, APIError) as e:
        raise RuntimeError(f"Docker SDK error: {e}") from e

"""
if __name__ == "__main__":
    print(deploy("/home/hexa/hexactf/pwn1"))
"""
