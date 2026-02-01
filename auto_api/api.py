from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
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

def normalize_downloads(challenge):
    raw = challenge.get("downloads") or challenge.get("files") or []
    if not isinstance(raw, list):
        return []

    normalized = []
    for item in raw:
        if isinstance(item, str):
            rel_path = item
            label = os.path.basename(rel_path)
        elif isinstance(item, dict):
            rel_path = item.get("path") or item.get("file")
            label = item.get("label") or item.get("name")
            if not label and rel_path:
                label = os.path.basename(rel_path)
        else:
            continue

        if not rel_path:
            continue

        normalized.append({"path": rel_path, "label": label or os.path.basename(rel_path)})
    return normalized

def safe_join(base_dir, rel_path):
    base_abs = os.path.abspath(base_dir)
    target = os.path.abspath(os.path.join(base_abs, rel_path))
    if os.path.commonpath([base_abs, target]) != base_abs:
        return None
    return target

def build_download_entries(problem_key, challenge):
    base_dir = challenge.get("dir")
    if not base_dir:
        return []

    entries = []
    normalized = normalize_downloads(challenge)
    for idx, item in enumerate(normalized):
        abs_path = safe_join(base_dir, item["path"])
        if not abs_path or not os.path.isfile(abs_path):
            continue
        size = os.path.getsize(abs_path)
        entries.append({
            "label": item["label"],
            "url": f"/api/download/{problem_key}/{idx}",
            "size": size
        })
    return entries

def allocate_instance_id(state):
    instance_id = state["next_instance_id"]
    state["next_instance_id"] += 1
    return instance_id

@app.get("/api/challenges")
def list_challenges():
    try:
        challenges = load_challenges()
        out = {}
        for key, challenge in challenges.items():
            ch = dict(challenge)
            ch["downloads"] = build_download_entries(key, challenge)
            out[key] = ch
        return out
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

@app.get("/api/download/{problem_key}/{file_index}")
def download(problem_key: str, file_index: int):
    challenges = load_challenges()
    challenge = challenges.get(problem_key)
    if not challenge:
        raise HTTPException(status_code=404, detail="challenge not found")

    normalized = normalize_downloads(challenge)
    if file_index < 0 or file_index >= len(normalized):
        raise HTTPException(status_code=404, detail="file not found")

    base_dir = challenge.get("dir")
    if not base_dir:
        raise HTTPException(status_code=404, detail="challenge dir not found")

    item = normalized[file_index]
    abs_path = safe_join(base_dir, item["path"])
    if not abs_path or not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="file not found")

    return FileResponse(abs_path, filename=item["label"], media_type="application/octet-stream")

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
