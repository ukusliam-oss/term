# Local preview server with caching off, so edited ES modules are always re-fetched.
# Run from 코딩/: python3 Term/serve.py  → http://127.0.0.1:5174/preview.html
import functools, http.server, os

class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1', 5174), NoStore).serve_forever()
