"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createServer, startServer } = require("../server.js");
const packageInfo = require("../package.json");

function request(port, pathname, method = "GET") {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: "127.0.0.1",
            port,
            method,
            path: pathname
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf8")
            }));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
    });
}

test("local HTTP server: complete endpoint checks", async (t) => {
    const server = createServer();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(async () => {
        await new Promise((resolve, reject) => {
            server.close((err) => err ? reject(err) : resolve());
        });
    });

    const port = server.address().port;

    await t.test("GET / serves the HTML page", async () => {
        const r = await request(port, "/");
        assert.equal(r.status, 200);
        assert.match(r.headers["content-type"], /^text\/html/);
        assert.match(r.body, /Memory Allocation Simulator/);
    });

    await t.test("GET /js/audio.js serves JavaScript", async () => {
        const r = await request(port, "/js/audio.js");
        assert.equal(r.status, 200);
        assert.match(r.headers["content-type"], /^text\/javascript/);
        assert.match(r.body, /class SoundFX/);
        assert.equal(r.headers["x-content-type-options"], "nosniff");
    });

    await t.test("GET /api/info returns valid server metadata", async () => {
        const r = await request(port, "/api/info");
        assert.equal(r.status, 200);
        assert.match(r.headers["content-type"], /application\/json/);
        const data = JSON.parse(r.body);
        assert.equal(data.name, "Memory Allocation Simulator");
        assert.equal(data.version, packageInfo.version);
        assert.equal(data.status, "ok");
        assert.equal(data.scope, "local-server");
        assert.deepEqual(data.plannedAlgorithms,
            ["First Fit", "Best Fit", "Worst Fit"]);
        assert.equal(JSON.stringify(data).includes("D:\\"),
            false, "Do not expose the local filesystem path");
    });

    await t.test("GET /api/info with a query remains available", async () => {
        const r = await request(port, "/api/info?check=1");
        assert.equal(r.status, 200);
    });

    await t.test("HEAD returns headers but no body", async () => {
        const r = await request(port, "/api/info", "HEAD");
        assert.equal(r.status, 200);
        assert.equal(r.body, "");
    });

    await t.test("static HEAD returns no body", async () => {
        const r = await request(port, "/js/audio.js", "HEAD");
        assert.equal(r.status, 200);
        assert.equal(r.body, "");
    });

    await t.test("unknown file returns 404", async () => {
        const r = await request(port, "/missing-file.js");
        assert.equal(r.status, 404);
    });

    await t.test("POST cannot modify files", async () => {
        const r = await request(port, "/api/info", "POST");
        assert.equal(r.status, 405);
        assert.equal(r.headers.allow, "GET, HEAD");
    });

    await t.test("malformed URL encoding returns 400", async () => {
        const r = await request(port, "/%ZZ");
        assert.equal(r.status, 400);
    });

    await t.test("a NUL byte in the path returns 400 and does not crash the server", async () => {
        for (const bad of ["/%00", "/js/%00.js", "/%00/../server.js"]) {
            const r = await request(port, bad);
            assert.equal(r.status, 400, bad);
        }
        // The same server must still answer normal requests afterwards.
        const after = await request(port, "/api/info");
        assert.equal(after.status, 200);
    });

    await t.test("encoded directory traversal is forbidden", async () => {
        const r = await request(port, "/..%2f..%2fserver.js");
        assert.equal(r.status, 403);
    });

    await t.test("Git configuration is not served", async () => {
        const r = await request(port, "/.git/config");
        assert.equal(r.status, 404);
    });
});

test("startServer rejects invalid ports without binding", () => {
    for (const port of ["invalid", -1, 0, 65536, 3.5]) {
        assert.throws(() => startServer(port), /PORT must be an integer/);
    }
});
