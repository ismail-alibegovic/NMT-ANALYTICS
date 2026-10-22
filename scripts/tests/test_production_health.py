import importlib.util
from pathlib import Path
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

spec = importlib.util.spec_from_file_location("production_health", Path(__file__).parents[1] / "production-health.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def check_response(self, body, content_type="application/json", status=200):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                if status == 302:
                    self.send_header("Location", "/login")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            return probe.check_health(f"http://127.0.0.1:{server.server_port}/health")
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_healthy(self):
        self.assertTrue(self.check_response(b'{"ok":true,"database":"connected","config":{"devBypassEnabled":false}}'))

    def test_rejects_html_protection_page(self):
        self.assertFalse(self.check_response(b"<html>Sign in</html>", "text/html"))

    def test_rejects_redirect(self):
        self.assertFalse(self.check_response(b"", status=302))

    def test_rejects_unavailable_database(self):
        self.assertFalse(self.check_response(b'{"ok":true,"database":"disconnected","config":{"devBypassEnabled":false}}'))

    def test_rejects_auth_bypass(self):
        self.assertFalse(self.check_response(b'{"ok":true,"database":"connected","config":{"devBypassEnabled":true}}'))

    def test_rejects_malformed_or_incomplete_payload(self):
        for body in [b"invalid", b"[]", b"null", b'{"ok":true}', b"x" * 65537]:
            with self.subTest(body_length=len(body)):
                self.assertFalse(self.check_response(body))

    def test_rejects_http_error(self):
        self.assertFalse(self.check_response(b"{}", status=503))


if __name__ == "__main__":
    unittest.main()
