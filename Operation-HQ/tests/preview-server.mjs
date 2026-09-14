import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://preview.local").pathname);
  const relative = requested === "/" ? "newtab.html" : requested.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  let body = fs.readFileSync(file);
  if (relative === "newtab.html") {
    body = Buffer.from(body.toString().replace("<script src=\"js/lib/chart.umd.min.js\">", "<script src=\"tests/preview-shim.js\"></script>\n<script src=\"js/lib/chart.umd.min.js\">"));
  }
  response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
  response.end(body);
}).listen(4173, "0.0.0.0", () => console.log("Operation HQ preview: http://0.0.0.0:4173"));
