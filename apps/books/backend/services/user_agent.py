"""Very small user-agent parser used only for display on the Active Sessions page.

Not meant to be exhaustive - it just needs to turn a raw ``User-Agent`` header
into a readable "device • OS" and "browser" label, so a signed-in user can
tell their sessions apart (e.g. to notice a login they don't recognize).
"""
from __future__ import annotations

from typing import NamedTuple


class DeviceInfo(NamedTuple):
    device: str
    browser: str


def parse_user_agent(user_agent: str | None) -> DeviceInfo:
    ua = user_agent or ""
    ua_lower = ua.lower()

    if "ipad" in ua_lower:
        device = "iPad"
    elif "iphone" in ua_lower:
        device = "iPhone"
    elif "android" in ua_lower:
        device = "Android Device"
    elif "macintosh" in ua_lower or "mac os x" in ua_lower:
        device = "Mac"
    elif "windows" in ua_lower:
        device = "Windows PC"
    elif "linux" in ua_lower:
        device = "Linux PC"
    else:
        device = "Unknown Device"

    if "edg/" in ua_lower:
        browser = "Edge"
    elif "opr/" in ua_lower or "opera" in ua_lower:
        browser = "Opera"
    elif "chrome/" in ua_lower and "chromium" not in ua_lower:
        browser = "Chrome"
    elif "firefox/" in ua_lower:
        browser = "Firefox"
    elif "safari/" in ua_lower and "chrome/" not in ua_lower:
        browser = "Safari"
    else:
        browser = "Unknown Browser"

    return DeviceInfo(device=device, browser=browser)
