/* global importScripts, Module */

const boards = new Map();
const pending = [];
let nextBoardId = 1;
let ready = false;

self.Module = {
  locateFile(path, prefix) {
    const base = prefix || "";
    return path.endsWith(".wasm") ? `${base}stockfish.wasm` : `${base}${path}`;
  },
  onRuntimeInitialized() {
    ready = true;
    self.postMessage({ type: "ready" });
    while (pending.length) handleMessage(pending.shift());
  }
};

importScripts("stockfish.js");

self.onmessage = (event) => {
  if (!ready) {
    pending.push(event.data);
    return;
  }

  handleMessage(event.data);
};

function handleMessage(message) {
  const { id, command, args = {} } = message || {};

  try {
    const result = runCommand(command, args);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error && error.message ? error.message : String(error) });
  }
}

function getBoard(boardId) {
  const board = boards.get(boardId);
  if (!board) throw new Error(`Unknown board id: ${boardId}`);
  return board;
}

function normalizeMoves(moves) {
  return Array.isArray(moves) ? moves.join(" ") : (moves || "");
}

function applyPosition(board, args) {
  const position = args.position || args.value || "";

  if (position) {
    const tokens = position.trim().split(/\s+/);
    let moveIndex = tokens.indexOf("moves");

    if (tokens[0] === "startpos") {
      board.reset();
      moveIndex = moveIndex < 0 ? tokens.length : moveIndex;
    } else if (tokens[0] === "fen") {
      const fenEnd = moveIndex < 0 ? tokens.length : moveIndex;
      board.setFen(tokens.slice(1, fenEnd).join(" "));
    } else {
      throw new Error(`Unsupported position command: ${position}`);
    }

    if (moveIndex >= 0 && moveIndex + 1 < tokens.length)
      board.pushMoves(tokens.slice(moveIndex + 1).join(" "));

    return board.fen();
  }

  if (args.fen)
    board.setFen(args.fen);
  else if (args.startpos)
    board.reset();

  const moves = normalizeMoves(args.moves);
  if (moves)
    board.pushMoves(moves);

  return board.fen();
}

function runCommand(command, args) {
  switch (command) {
  case "info":
    return Module.info();
  case "variants":
    return Module.variants();
  case "startingFen":
    return Module.startingFen(args.variant || "nguhanh");
  case "newBoard": {
    const board = args.fen
      ? new Module.Board(args.variant || "nguhanh", args.fen, Boolean(args.chess960))
      : new Module.Board(args.variant || "nguhanh");
    const boardId = nextBoardId++;
    boards.set(boardId, board);
    return boardId;
  }
  case "deleteBoard":
    boards.delete(args.boardId);
    return true;
  case "fen":
    return getBoard(args.boardId).fen();
  case "setFen":
    getBoard(args.boardId).setFen(args.fen);
    return true;
  case "position":
    return applyPosition(getBoard(args.boardId), args);
  case "legalMoves":
    return getBoard(args.boardId).legalMoves();
  case "push":
    return getBoard(args.boardId).push(args.move);
  case "bestMove":
    return getBoard(args.boardId).bestMove(Number(args.movetime || 1000));
  case "pop":
    getBoard(args.boardId).pop();
    return true;
  case "reset":
    getBoard(args.boardId).reset();
    return true;
  default:
    throw new Error(`Unknown command: ${command}`);
  }
}
