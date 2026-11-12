import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve("public-site");
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};
createServer((req: any, res: any) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  const target = resolve(
    root,
    path.replace(/^\/adoption-project\//, "") || "index.html",
  );
  if (
    !path.startsWith("/adoption-project/") ||
    !target.startsWith(root + sep)
  ) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      mime[extname(target)] || "application/octet-stream",
    );
    const bytes = readFileSync(target);
    res.setHeader("Accept-Ranges", "bytes");
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(
        range[2] ? Number(range[2]) : bytes.length - 1,
        bytes.length - 1,
      );
      if (start > end || start >= bytes.length) {
        res
          .writeHead(416, { "Content-Range": `bytes */${bytes.length}` })
          .end();
        return;
      }
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": end - start + 1,
      });
      res.end(bytes.subarray(start, end + 1));
    } else {
      res.setHeader("Content-Length", bytes.length);
      res.end(bytes);
    }
  } catch {
    res.writeHead(404).end();
  }
}).listen(3200, "127.0.0.1", () =>
  console.log("Public preview: http://127.0.0.1:3200/adoption-project/"),
);
