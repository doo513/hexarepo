# api/api.py
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import uvicorn
import json
import auto_deploy
import auto_stop
import os

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@app.get("/", response_class=HTMLResponse)
def index():
    index_path = os.path.join(BASE_DIR, "index.html")
    with open(index_path, encoding="utf-8") as f:
        return f.read()

# instance_id 값을 생성

STATE_FILE = "instances.json"
def load_state():
    with open(STATE_FILE, "r") as f: 
        return json.load(f)

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def allocate_instance_id(state):
    instance_id = state["next_instance_id"] 
    state["next_instance_id"] += 1
    return instance_id

# 🔥 문제 경로를 body로 받도록 수정 (확장 가능)
@app.post("/start")
def start(problem: str = "pwn1"):
    try:
        problem_dir = f"/home/hexa/hexactf/{problem}"
        if not os.path.exists(problem_dir):
            return {"status": "error", "error": "problem not found"}

        state = load_state()
        instance_id = allocate_instance_id(state)

        result = auto_deploy.deploy(problem_dir, instance_id)

        state["instances"][str(instance_id)] = {
            "problem": problem,
            "container": result["container_name"],
            "port": result["external_port"]
        }
        save_state(state)

        server_host = "http://192.168.0.163"
        url = f"{server_host}:{result['external_port']}"

        return {
            "status": "ok",
            "instance_id": instance_id,
            "url": url
        }

    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/stop/{instance_id}")
def stop(instance_id: int):
    try:
        state = load_state()
        info = state["instances"].get(str(instance_id))

        if not info:
            return {"status": "error", "error": "instance not found"}

        auto_stop.stop_container(info["container"])

        del state["instances"][str(instance_id)]
        save_state(state)

        return {"status": "ok"}

    except Exception as e:
        return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    # 🔥 중요: 모듈 경로는 "api.api:app" 이 맞아야 함
    uvicorn.run("api:app", host="0.0.0.0", port=5000, reload=True)

