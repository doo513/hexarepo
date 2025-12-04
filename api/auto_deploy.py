import subprocess
import random
import re
import os

MIN_PORT = 30000
MAX_PORT = 40000

def find_free_port():
    while True:
        p = random.randint(MIN_PORT, MAX_PORT)
        result = subprocess.run(
            ["lsof", "-i", f":{p}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        if result.returncode != 0:  
            return p

def get_internal_port(dockerfile):
    if not os.path.exists(dockerfile):
        return 3000

    content = open(dockerfile).read()
    m = re.search(r"EXPOSE\s+(\d+)", content)
    return int(m.group(1)) if m else 3000

def deploy():
    name = "test_challenge"
    dockerfile_path = "./Dockerfile"   # 테스트용
    internal_port = get_internal_port(dockerfile_path)
    external_port = find_free_port()

    subprocess.run(["docker", "build", "-t", name, "."], check=False)

    subprocess.run([
        "docker", "run", "-d",
        "-p", f"{external_port}:{internal_port}",
        "--name", name, name
    ], check=False)

    print(f"Running on port: {external_port}")

if __name__ == "__main__":
    deploy()
