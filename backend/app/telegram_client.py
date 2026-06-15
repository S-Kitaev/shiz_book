import json
import logging
from typing import Any
from urllib import error, request

from app.config import settings

logger = logging.getLogger(__name__)

MESSAGE_LIMIT = 4096
CAPTION_LIMIT = 1024


def telegram_status() -> dict[str, bool]:
    return {
        "enabled": settings.tg_enabled,
        "dry_run": settings.tg_dry_run,
        "channel_configured": bool(settings.tg_channel_id),
        "token_configured": bool(settings.tg_token),
    }


def build_post_text(*, title: str, text: str, event_url: str | None = None) -> str:
    return _join_message_parts(title, text, event_url)


def publish_admin_post(
    *,
    title: str,
    text: str,
) -> dict[str, Any]:
    message = build_post_text(title=title, text=text)
    return send_message(text=message)


def publish_event_proposal(
    *,
    title: str,
    description: str,
    image_url: str | None = None,
    external_url: str | None = None,
) -> dict[str, Any]:
    message = _join_message_parts(
        "Новое предложение мероприятия",
        title,
        description,
        external_url,
    )
    return send_message(text=message, image_url=image_url)


def send_message(*, text: str, image_url: str | None = None) -> dict[str, Any]:
    if not settings.tg_enabled:
        return {
            "status": "disabled",
            "ok": True,
            "payload": _safe_payload(text=text, image_url=image_url),
        }

    if not settings.tg_channel_id:
        return {
            "status": "error",
            "ok": False,
            "error": "TG_CHANNEL_ID is not configured.",
            "payload": _safe_payload(text=text, image_url=image_url),
        }

    if not settings.tg_token:
        return {
            "status": "error",
            "ok": False,
            "error": "Telegram token is not configured.",
            "payload": _safe_payload(text=text, image_url=image_url),
        }

    method, payload = _telegram_payload(text=text, image_url=image_url)
    if settings.tg_dry_run:
        return {
            "status": "dry_run",
            "ok": True,
            "method": method,
            "payload": _safe_payload(text=text, image_url=image_url),
        }

    try:
        response = _post_to_telegram(method, payload)
    except (OSError, error.URLError, error.HTTPError, TimeoutError) as exc:
        logger.warning("Telegram publish failed: %s", exc.__class__.__name__)
        return {
            "status": "error",
            "ok": False,
            "error": exc.__class__.__name__,
            "payload": _safe_payload(text=text, image_url=image_url),
        }

    if response.get("ok"):
        return {
            "status": "sent",
            "ok": True,
            "method": method,
        }

    return {
        "status": "error",
        "ok": False,
        "error": str(response.get("description") or "Telegram API error."),
        "payload": _safe_payload(text=text, image_url=image_url),
    }


def _telegram_payload(*, text: str, image_url: str | None = None) -> tuple[str, dict[str, Any]]:
    text = _truncate(text, MESSAGE_LIMIT)
    if image_url and image_url.startswith(("http://", "https://")):
        return (
            "sendPhoto",
            {
                "chat_id": settings.tg_channel_id,
                "photo": image_url,
                "caption": _truncate(text, CAPTION_LIMIT),
            },
        )
    return (
        "sendMessage",
        {
            "chat_id": settings.tg_channel_id,
            "text": text,
            "disable_web_page_preview": False,
        },
    )


def _safe_payload(*, text: str, image_url: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "chat_id": settings.tg_channel_id,
        "text": text,
    }
    if image_url:
        payload["image_url"] = image_url if image_url.startswith(("http://", "https://")) else "inline-image"
    return payload


def _join_message_parts(*parts: str | None) -> str:
    return "\n\n".join(part.strip() for part in parts if part and part.strip())


def _truncate(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def _post_to_telegram(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    token = settings.tg_token
    if not token:
        raise RuntimeError("Telegram token is not configured.")

    url = f"https://api.telegram.org/bot{token}/{method}"
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            raise exc
