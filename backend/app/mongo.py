from collections.abc import Generator

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

from app.config import settings

client: MongoClient = MongoClient(settings.mongo_url, serverSelectionTimeoutMS=3000)
mongo_db: Database = client[settings.mongo_db]


def get_mongo() -> Generator[Database, None, None]:
    yield mongo_db


def init_mongo() -> None:
    client.admin.command("ping")
    mongo_db.events.create_index([("created_at", DESCENDING)])
    mongo_db.events.create_index([("status", ASCENDING), ("hidden", ASCENDING)])
    mongo_db.feed_posts.create_index([("created_at", DESCENDING)])
    mongo_db.feed_posts.create_index([("hidden", ASCENDING)])
    mongo_db.comments.create_index([("event_id", ASCENDING), ("created_at", ASCENDING)])
    mongo_db.votes.create_index([("event_id", ASCENDING), ("user_id", ASCENDING)], unique=True)
