from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json, os

from . import auto_deploy
from . import auto_stop

class StartRequest(BaseModel):
    problem: str

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
STATIC_DIR = os.path.join(ROOT_DIR, "static")
STATE_FILE = os.path.join(ROOT_DIR, "instances.json")
CHALLENGE_FILE = os.path.join(ROOT_DIR, "challenges.json")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/", response_class=HTMLResponse)
def index():
    with open(os.path.join(STATIC_DIR, "index.html"), encoding="utf-8") as f:
        return f.read()
    
def load_state():
    if not os.path.exists(STATE_FILE):
        return {"next_instance_id": 1, "instances": {}}
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def load_challenges():
    with open(CHALLENGE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def allocate_instance_id(state):
    instance_id = state["next_instance_id"]
    state["next_instance_id"] += 1
    return instance_id

@app.get("/api/challenges")
def list_challenges():
    try:
        return load_challenges()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="challenges.json not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="challenges.json is invalid JSON")
    
@app.post("/start")
def start(req: StartRequest):
    problem_key = req.problem

    state = load_state()
    challenges = load_challenges()

    if problem_key not in challenges:
        raise HTTPException(status_code=400, detail="Invalid problem key")

    challenge = challenges[problem_key]
    problem_dir = challenge["dir"]
    port = challenge.get("port")

    instance_id = allocate_instance_id(state)

    try:
        info = auto_deploy.deploy(problem_dir, instance_id, port=port)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid port in challenges.json")

    state["instances"][str(instance_id)] = {
        "instance_id": instance_id,
        "problem": problem_key,
        "challenge_id": challenge.get("challenge_id", problem_key),
        "title": challenge.get("title", problem_key),
        "port": info["external_port"],
        "container": info["container_name"],
        "status": "running"
    }
    save_state(state)

    server_host = "http://192.168.0.163"
    url = f"{server_host}:{info['external_port']}"

    return {
        "status": "ok",
        "instance_id": instance_id,
        "problem": problem_key,
        "title": challenge.get("title", problem_key),
        "url": url
    }
@app.post("/stop/{instance_id}")
def stop(instance_id: int):
    state = load_state()
    inst = state["instances"].get(str(instance_id))

    if not inst:
        raise HTTPException(status_code=404, detail="instance not found")

    container_name = inst.get("container")
    if not container_name:
        raise HTTPException(status_code=500, detail="container name missing in state")

    result = auto_stop.stop_container(container_name)

    if result["status"] != "ok":
        raise HTTPException(status_code=500, detail=result.get("error", "stop failed"))

    del state["instances"][str(instance_id)]
    save_state(state)

    return {"status": "ok", "instance_id": instance_id, "container": container_name}
