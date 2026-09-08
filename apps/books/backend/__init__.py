"""Rooman Books backend package."""
import datetime

# Python 3.10 backward compatibility shim for datetime.UTC
if not hasattr(datetime, "UTC"):
    datetime.UTC = datetime.timezone.utc  # noqa: UP017
