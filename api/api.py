# api.py
from flask import Flask
import subprocess

app = Flask(__name__)

@app.route("/")
def index():
    return open("index.html").read()

@app.post("/start")
def start():
    subprocess.Popen(["python3", "auto_deploy.py"])
    return {"status": "started"}

@app.post("/stop")
def stop():
    subprocess.Popen(["python3", "auto_stop.py"])
    return {"status": "stopped"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
