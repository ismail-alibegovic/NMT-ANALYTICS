#!/usr/bin/env python3
"""Read-only production availability probe. Never logs response bodies."""
import json
import time
import urllib.error
import urllib.request

HEALTH_URL = "https://travline-ten.vercel.app/api/health"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_health(url=HEALTH_URL):
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=15) as response:
            if response.status != 200:
                return False
            if response.headers.get_content_type() != "application/json":
                return False
            body = response.read(65537)
            if len(body) > 65536:
                return False
            data = json.loads(body)
            return (isinstance(data, dict) and data.get("ok") is True
                    and data.get("database") == "connected"
                    and isinstance(data.get("config"), dict)
                    and data["config"].get("devBypassEnabled") is False)
    except (OSError, ValueError, urllib.error.URLError):
        return False


def main():
    for attempt in range(1, 4):
        if check_health():
            print("Production health PASS: database connected; authentication bypass disabled.")
            return 0
        print(f"Production health probe {attempt}/3 failed.")
        if attempt < 3:
            time.sleep(20)
    print("::error::Production availability check failed three consecutive probes.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
