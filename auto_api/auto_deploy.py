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

def get_internal_port(dockerfile_path):
    with open(dockerfile_path, encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"EXPOSE\s+(\d+)", content)
    return int(m.group(1)) if m else 5000

def deploy(problem_dir,instanceid):
    problem_dir = os.path.abspath(problem_dir) # 문제 경로 

    dockerfile_path = os.path.join(problem_dir, "Dockerfile") # 경로 디렉토리 내 도커 파일 찾기
    if not os.path.exists(dockerfile_path):
        raise FileNotFoundError(f"Dockerfile not found in {problem_dir}")

    # 이미지 이름
    problem_name = os.path.basename(problem_dir)
    image_name = f"{problem_name}".lower()

    # EXPOSE 포트 읽기
    internal = get_internal_port(dockerfile_path)

    # 외부 포트 찾기
    external = find_free_port()

    # 🔥 핵심: build context는 반드시 문제 폴더여야 한다!!
    subprocess.run(["docker", "build", "-t", image_name, problem_dir], check=True)

    container_name = f"{image_name}_{instanceid}"

    subprocess.run([
        "docker", "run", "-d",
        "-p", f"{external}:{internal}",
        "--name", container_name,
        image_name
    ], check=True)

    return {
        "container_name": container_name,
        "image_name": image_name,
        "external_port": external,
        "internal_port": internal,
        "id" : instanceid
    }

"""
if __name__ == "__main__":
    print(deploy("/home/hexa/hexactf/pwn1"))
"""