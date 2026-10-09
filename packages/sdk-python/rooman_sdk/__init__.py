"""Shared helpers for Rooman One services.

- ``tokens``: check Core access tokens and enforce apps, modules and roles.
- ``events``: the event envelope and its HMAC signature.
- ``outbox``: write events in the same transaction as the business change.
- ``consumer``: process each delivered event once, even when it arrives twice.
"""

__version__ = "0.1.0"
