# auto_stop.py
import subprocess

def stop():
    subprocess.run(["docker", "stop", "test_challenge"], check=False)
    subprocess.run(["docker", "rm", "test_challenge"], check=False)

if __name__ == "__main__":
    stop()
