from datetime import datetime, date, timedelta, timezone

_BRASILIA = timezone(timedelta(hours=-3))


def agora_brasil() -> datetime:
    """Datetime atual em GMT-3, sem info de timezone (compatível com datetimes naive do DB)."""
    return datetime.now(_BRASILIA).replace(tzinfo=None)


def hoje_brasil() -> date:
    """Data atual em GMT-3."""
    return datetime.now(_BRASILIA).date()
