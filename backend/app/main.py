from contextlib import asynccontextmanager
import logging
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from pymongo.errors import PyMongoError

from app.bootstrap import ensure_superadmin
from app.crud import write_error_log
from app.database import SessionLocal, init_db
from app.mongo import init_mongo
from app.routes import admin, auth, content, superadmin

logger = logging.getLogger(__name__)


def initialize_database(max_attempts: int = 12, delay_seconds: float = 2.0) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            init_db()
            db = SessionLocal()
            try:
                ensure_superadmin(db)
            finally:
                db.close()
            return
        except OperationalError:
            if attempt == max_attempts:
                raise
            logger.warning(
                "Database is not ready yet, retrying startup attempt %s/%s.",
                attempt,
                max_attempts,
            )
            time.sleep(delay_seconds)


def initialize_mongo(max_attempts: int = 12, delay_seconds: float = 2.0) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            init_mongo()
            return
        except PyMongoError:
            if attempt == max_attempts:
                raise
            logger.warning(
                "MongoDB is not ready yet, retrying startup attempt %s/%s.",
                attempt,
                max_attempts,
            )
            time.sleep(delay_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    initialize_mongo()
    yield


app = FastAPI(title="shiz-site backend", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(superadmin.router)
app.include_router(content.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled application error.")
    db = SessionLocal()
    try:
        write_error_log(
            db,
            source="unhandled_exception",
            message=exc.__class__.__name__,
            detail=str(exc),
            context={"method": request.method, "path": request.url.path},
        )
        db.commit()
    except Exception:
        logger.exception("Could not write system error log.")
        db.rollback()
    finally:
        db.close()
    return JSONResponse(
        status_code=500,
        content={"detail": "Request failed."},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
