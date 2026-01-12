from fastapi import FastAPI
from pydantic import BaseModel
import subprocess

def stop_container(container_name):

    subprocess.run(
        ["docker", "rm", "-f", container_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    return {
        "status": "ok",
        "container": container_name
    }
