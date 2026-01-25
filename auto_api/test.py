from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import json, os

app = FastAPI()

@app.get("/")
def index():
    return {'hello':'world'}