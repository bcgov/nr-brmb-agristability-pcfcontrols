// Author: Jeroen Jonckheer
// Minimal static file server for the demo harness. Playwright's webServer
// launches `node e2e-demo/serve.cjs harness` so the recorder loads our own
// index.html (which references demo.js/demo.css) - no esbuild serve overlay
// quirks. Stays alive until Playwright tears it down.
const http = require("http");
const fs = require("fs");
const path = require("path");

const dir = path.resolve(process.argv[2] || "harness");
const port = Number(process.argv[3] || 5174);

const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json",
};

http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url || "/").split("?")[0]);
    if (rel === "/") rel = "/index.html";
    const file = path.join(dir, rel);
    // Prevent path traversal outside the served directory.
    if (!file.startsWith(dir)) {
        res.statusCode = 403;
        res.end("403");
        return;
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.statusCode = 404;
            res.end("404 " + rel);
            return;
        }
        res.setHeader(
            "Content-Type",
            types[path.extname(file)] || "application/octet-stream"
        );
        res.end(data);
    });
}).listen(port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log("demo harness served from " + dir + " on http://127.0.0.1:" + port);
});
