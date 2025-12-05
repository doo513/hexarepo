# api/auto_deploy.py
import subprocess
import random
import re
import os

MIN_PORT = 30000
MAX_PORT = 40000

def find_free_port():
    while True:
        p = random.randint(MIN_PORT, MAX_PORT)
        res = subprocess.run(
            ["lsof", "-i", f":{p}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if res.returncode != 0:
            return p

def get_internal_port():
    with open("Dockerfile", encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"EXPOSE\s+(\d+)", content)
    return int(m.group(1)) if m else 5000

def deploy():
    name = "test_challenge"
    internal = get_internal_port()
    external = find_free_port()

    # build
    subprocess.run(["docker", "build", "-t", name, "."], check=True)

    # run
    container_name = f"{name}_{external}"
    subprocess.run(
        [
            "docker", "run", "-d",
            "-p", f"{external}:{internal}",
            "--name", container_name,
            name,
        ],
        check=True,
    )

    # 마지막 컨테이너 이름을 파일에 저장 (stop에서 쓰려고)
    with open(".last_container", "w", encoding="utf-8") as f:
        f.write(container_name)

    return {
        "container_name": container_name,
        "external_port": external,
        "internal_port": internal,
    }

if __name__ == "__main__":
    deploy()
