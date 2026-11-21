import ssl
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import certifi
import webview

TARGET = "https://vibecord-debug.onrender.com"
SSL_CTX = ssl.create_default_context(cafile=certifi.where())

class Bridge(BaseHTTPRequestHandler):
    def proxy(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "origin", "referer", "accept-encoding")}
        req = urllib.request.Request(TARGET + self.path, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as resp:
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in ("transfer-encoding", "content-encoding", "connection"):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ("transfer-encoding", "content-encoding", "connection"):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Waking up Render... refresh in a few seconds ({e})".encode())

    do_GET = do_POST = proxy
    def log_message(self, *args): pass

if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Bridge)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    webview.create_window("VibeCord", f"http://127.0.0.1:{port}/", width=1200, height=760, background_color="#0b0c0e")
    webview.start()
