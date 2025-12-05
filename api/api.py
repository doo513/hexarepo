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
    # api/index.html 읽어서 그대로 반환
    index_path = os.path.join(BASE_DIR, "index.html")
    with open(index_path, encoding="utf-8") as f:
        return f.read()

@app.post("/start")
def start():
    try:
        result = auto_deploy.deploy()
        port = result["external_port"]
        # 여기서 서버 IP/도메인은 직접 넣어야 함
        server_host = "http://localhost"  # 나중에 실제 서버 IP/도메인으로 바꾸면 됨
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
    # uvicorn으로 실행
    uvicorn.run("api:app", host="0.0.0.0", port=5000, reload=True)
