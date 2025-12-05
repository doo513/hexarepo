# api/api.py
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import uvicorn
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

# 🔥 문제 경로를 body로 받도록 수정 (확장 가능)
@app.post("/start")
def start(problem: str = "pwn1"):
    try:
        # 문제 폴더 절대경로
        problem_dir = f"/home/hexa/hexactf/{problem}"

        if not os.path.exists(problem_dir):
            return {"status": "error", "error": f"Problem folder not found: {problem_dir}"}

        result = auto_deploy.deploy(problem_dir)
        port = result["external_port"]

        # 서버 IP
        server_host = "http://192.168.0.163"

        url = f"{server_host}:{port}"
        return {"status": "ok", "url": url}

    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.post("/stop")
def stop():
    try:
        auto_stop.stop()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    # 🔥 중요: 모듈 경로는 "api.api:app" 이 맞아야 함
    uvicorn.run("api:app", host="0.0.0.0", port=5000, reload=True)

