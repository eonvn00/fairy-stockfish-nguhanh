import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "dist");
const workerPath = path.join(distDir, "stockfish.worker.js");
const movetime = Number(process.env.NGUHANH_MOVETIME_MS || 250);

for (const file of ["stockfish.js", "stockfish.wasm", "stockfish.worker.js"])
  assert.ok(fs.existsSync(path.join(distDir, file)), `Missing dist/${file}`);

const shim = `
const { parentPort } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const distDir = ${JSON.stringify(distDir)};
const workerPath = ${JSON.stringify(workerPath)};

global.self = global;
global.require = require;
global.__dirname = distDir;
global.__filename = path.join(distDir, "stockfish.worker.js");
global.postMessage = (message) => parentPort.postMessage(message);
global.importScripts = (...scripts) => {
  for (const script of scripts) {
    const filename = path.resolve(distDir, script);
    vm.runInThisContext(fs.readFileSync(filename, "utf8"), { filename });
  }
};

parentPort.on("message", (message) => {
  if (typeof global.onmessage === "function")
    global.onmessage({ data: message });
});

vm.runInThisContext(fs.readFileSync(workerPath, "utf8"), { filename: workerPath });
`;

const worker = new Worker(shim, { eval: true });
const pending = new Map();
let nextId = 1;
const hardTimeout = setTimeout(() => {
  console.error("Timed out while testing nguhanh WASM worker");
  worker.terminate().finally(() => process.exit(1));
}, 60000);

const ready = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Timed out waiting for worker ready")), 30000);

  worker.on("message", (message) => {
    if (message && message.type === "ready") {
      clearTimeout(timeout);
      resolve();
      return;
    }

    const request = pending.get(message.id);
    if (!request)
      return;

    pending.delete(message.id);
    if (message.error)
      request.reject(new Error(message.error));
    else
      request.resolve(message.result);
  });

  worker.on("error", reject);
});

function call(command, args = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, command, args });
  });
}

try {
  await ready;

  const variants = await call("variants");
  assert.match(variants, /(^| )nguhanh( |$)/, "nguhanh variant is not registered");

  const boardId = await call("newBoard", { variant: "nguhanh" });
  const fen = await call("fen", { boardId });
  assert.match(fen, /^iumkht1\/7\/7\/7\/7\/7\/IUMKHT1\[\] w /, "unexpected nguhanh start FEN");

  const positionedFen = await call("position", { boardId, position: "startpos" });
  assert.equal(positionedFen, fen, "position startpos did not preserve nguhanh start FEN");

  const legalMoves = await call("legalMoves", { boardId });
  assert.ok(legalMoves.trim().length > 0, "nguhanh startpos has no legal moves");

  const bestMove = await call("bestMove", { boardId, movetime });
  assert.ok(bestMove.trim().length > 0, "bestMove returned an empty move");
  assert.match(bestMove, /^[a-z][1-9][a-z][1-9]/, `bestMove is not UCI-like: ${bestMove}`);

  console.log(`nguhanh worker smoke ok: legalMoves=${legalMoves.split(" ").length}, bestMove=${bestMove}`);
} finally {
  clearTimeout(hardTimeout);
  for (const request of pending.values())
    request.reject(new Error("Worker terminated"));
  pending.clear();
  await worker.terminate();
}
