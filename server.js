/*
 * Memory Allocation Simulator
 * Local HTTP Server
 * Team 3 - HAYTHAM
 *
 * Runs locally only. No third-party packages are required.
 */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { version } = require("./package.json");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const PUBLIC_DIR = path.resolve(__dirname, "public");

const mimeTypes = Object.freeze({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
});

function sendText(res, statusCode, message, method = "GET") {
    const body = Buffer.from(message, "utf8");
    res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": body.length
    });
    res.end(method === "HEAD" ? undefined : body);
}

function insidePublic(candidate) {
    const relative = path.relative(PUBLIC_DIR, candidate);
    return relative !== ".." &&
        !relative.startsWith(".." + path.sep) &&
        !path.isAbsolute(relative);
}

// Serves static files only after confirming they remain under public/.
function serveFile(filePath, res, method) {
    if (!insidePublic(filePath)) {
        sendText(res, 403, "Forbidden", method);
        return;
    }

    // Also guard against a symbolic link inside public/ pointing outside.
    fs.realpath(filePath, (err, realFile) => {
        if (err) {
            sendText(res, 404, "Not Found", method);
            return;
        }
        if (!insidePublic(realFile)) {
            sendText(res, 403, "Forbidden", method);
            return;
        }

        fs.stat(realFile, (statErr, stats) => {
            if (statErr || !stats.isFile()) {
                sendText(res, 404, "Not Found", method);
                return;
            }

            res.writeHead(200, {
                "Content-Type": mimeTypes[path.extname(realFile).toLowerCase()] ||
                    "application/octet-stream",
                "X-Content-Type-Options": "nosniff",
                "Content-Length": stats.size
            });
            if (method === "HEAD") {
                res.end();
                return;
            }

            const stream = fs.createReadStream(realFile);
            stream.on("error", () => res.destroy());
            stream.pipe(res);
        });
    });
}

function createServer() {
    return http.createServer((req, res) => {
        try {
            handleRequest(req, res);
        } catch (err) {
            // Last line of defence: one bad request must never stop the server.
            if (!res.headersSent) {
                sendText(res, 500, "Internal Server Error");
            } else {
                res.destroy();
            }
        }
    });
}

function handleRequest(req, res) {
    const method = req.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        sendText(res, 405, "Method Not Allowed", method);
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch {
        sendText(res, 400, "Bad Request", method);
        return;
    }

    // A NUL byte makes fs.realpath() throw synchronously, which would
    // crash the whole process, so reject it before touching the disk.
    if (pathname.includes("\0")) {
        sendText(res, 400, "Bad Request", method);
        return;
    }

    if (pathname === "/api/info") {
        // 'ok' means the local HTTP server is responding, not that
        // the simulation algorithms or user interface are complete.
        const body = Buffer.from(JSON.stringify({
            name: "Memory Allocation Simulator",
            version,
            status: "ok",
            scope: "local-server",
            plannedAlgorithms: ["First Fit", "Best Fit", "Worst Fit"]
        }), "utf8");

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "Content-Length": body.length
        });
        res.end(method === "HEAD" ? undefined : body);
        return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname;
    const normalized = relativePath.replace(/^[/\\]+/, "");
    const filePath = path.resolve(PUBLIC_DIR, normalized);

    if (!insidePublic(filePath)) {
        sendText(res, 403, "Forbidden", method);
        return;
    }

    serveFile(filePath, res, method);
}

function startServer(port = DEFAULT_PORT) {
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
        throw new RangeError("PORT must be an integer between 1 and 65535.");
    }
    const server = createServer();
    server.on("error", (err) => {
        console.error("Unable to start local server:", err.message);
        process.exitCode = 1;
    });
    server.listen(numericPort, HOST, () => {
        console.log(`Memory Simulator running at http://${HOST}:${numericPort}`);
    });
    return server;
}

if (require.main === module) {
    try {
        startServer(process.env.PORT === undefined ? DEFAULT_PORT : process.env.PORT);
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    }
}

module.exports = { createServer, startServer, serveFile };
