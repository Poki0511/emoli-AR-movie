// Serve the actual static export, with a synthetic camera injected for local QA only.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../out/", import.meta.url));
const fixture = fileURLToPath(new URL("./camera-fixture.js", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".mind": "application/octet-stream" };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const filename = url.pathname === "/__test/camera-fixture.js" ? fixture : path.resolve(root, relative);
    if (filename !== fixture && !filename.startsWith(root)) { res.writeHead(403).end(); return; }
    const size = (await stat(filename)).size;
    res.setHeader("Content-Type", types[path.extname(filename)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    if (filename.endsWith("index.html")) {
      const html = (await readFile(filename, "utf8")).replace("<head>", '<head><script src="/__test/camera-fixture.js"></script>');
      res.end(html); return;
    }
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]); const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) { res.writeHead(416).end(); return; }
      res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
      createReadStream(filename, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Length": size, "Accept-Ranges": "bytes" });
      createReadStream(filename).pipe(res);
    }
  } catch { res.writeHead(404).end("Not found; build the static export first."); }
}).listen(8773, "127.0.0.1", () => console.log("Synthetic-camera QA of static export: http://127.0.0.1:8773/?debug=true (local only)"));
