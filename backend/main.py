from fastapi import FastAPI

app = FastAPI(title="shiz-site backend")


@app.get("/api/health")
def health():
    return {"status": "ok"}