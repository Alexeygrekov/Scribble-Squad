import { randomInt } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Router } from "express";
import { fileURLToPath } from "url";

const router = Router();

const rooms = new Map();
const ROOM_ID_LENGTH = 6;
const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WORDS = [
  "ice cream",
  "rainbow",
  "elephant",
  "volcano",
  "dragon",
  "hamburger",
  "headphones",
  "bicycle",
  "piano",
  "rocket"
];
const STORAGE_FILE_VERSION = 1;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOMS_STORE_FILE = path.resolve(__dirname, "../../.runtime/rooms.json");

let persistTimer = null;
const roomUpdateSubscribers = new Set();

function normalizePersistedRoom(rawRoom) {
  const roomId = String(rawRoom?.id || "").trim().toUpperCase();
  const creator = String(rawRoom?.creator || rawRoom?.host || "").trim();
  if (!roomId || !creator) {
    return null;
  }

  const playerNames = Array.isArray(rawRoom?.players)
    ? rawRoom.players.map((player) => String(player || "").trim()).filter(Boolean)
    : [];

  if (!playerNames.some((player) => player.toLowerCase() === creator.toLowerCase())) {
    playerNames.unshift(creator);
  }

  const players = Array.from(new Set(playerNames));
  if (players.length === 0) {
    return null;
  }

  const scores = {};
  players.forEach((player) => {
    const score = Number(rawRoom?.scores?.[player]);
    scores[player] = Number.isFinite(score) ? score : 0;
  });

  const guessedPlayers = Array.isArray(rawRoom?.guessedPlayers)
    ? rawRoom.guessedPlayers
      .map((player) => String(player || "").trim())
      .filter((player) => players.some((name) => name.toLowerCase() === player.toLowerCase()))
    : [];

  const messages = Array.isArray(rawRoom?.messages)
    ? rawRoom.messages
      .map((message) => {
        const text = String(message?.text || "").trim();
        if (!text) {
          return null;
        }
        return {
          id: typeof message?.id === "string" ? message.id : `msg_${Date.now()}_${randomInt(1000, 9999)}`,
          type: message?.type === "system" ? "system" : "guess",
          username: String(message?.username || "System").trim() || "System",
          text,
          ts: Number.isFinite(Number(message?.ts)) ? Number(message.ts) : Date.now()
        };
      })
      .filter(Boolean)
    : [];

  const strokes = Array.isArray(rawRoom?.strokes)
    ? rawRoom.strokes
      .map((stroke) => {
        const mode = stroke?.mode === "fill" ? "fill" : "stroke";
        const points = sanitizePoints(stroke?.points);
        if (mode === "stroke" && points.length < 2) {
          return null;
        }
        return {
          id: typeof stroke?.id === "string" ? stroke.id : `stroke_${Date.now()}_${randomInt(1000, 9999)}`,
          mode,
          color: typeof stroke?.color === "string" ? stroke.color : "#f55a42",
          size: Math.max(1, Math.min(24, Number(stroke?.size) || 4)),
          points
        };
      })
      .filter(Boolean)
    : [];

  const drawerCandidate = String(rawRoom?.drawer || "").trim();
  const drawer = players.find((player) => player.toLowerCase() === drawerCandidate.toLowerCase()) || null;

  return {
    id: roomId,
    phase: rawRoom?.phase === "playing" ? "playing" : "lobby",
    creator,
    host: creator,
    drawer,
    word: typeof rawRoom?.word === "string" ? rawRoom.word : "",
    players,
    scores,
    guessedPlayers: new Set(guessedPlayers),
    messages,
    strokes,
    createdAt: Number.isFinite(Number(rawRoom?.createdAt)) ? Number(rawRoom.createdAt) : Date.now()
  };
}

function readPersistedRooms() {
  try {
    const raw = readFileSync(ROOMS_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const storedRooms = Array.isArray(parsed?.rooms) ? parsed.rooms : [];

    storedRooms.forEach((rawRoom) => {
      const normalizedRoom = normalizePersistedRoom(rawRoom);
      if (normalizedRoom) {
        rooms.set(normalizedRoom.id, normalizedRoom);
      }
    });
  } catch {
    // no persisted rooms available yet
  }
}

function writePersistedRooms() {
  try {
    mkdirSync(path.dirname(ROOMS_STORE_FILE), { recursive: true });

    const payload = {
      version: STORAGE_FILE_VERSION,
      savedAt: Date.now(),
      rooms: Array.from(rooms.values()).map((room) => ({
        ...room,
        guessedPlayers: Array.from(room.guessedPlayers)
      }))
    };

    writeFileSync(ROOMS_STORE_FILE, JSON.stringify(payload), "utf8");
  } catch {
    // keep API running even if persistence fails
  }
}

function scheduleRoomsPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    writePersistedRooms();
  }, 120);
}

function notifyRoomUpdated(roomId) {
  roomUpdateSubscribers.forEach((listener) => {
    try {
      listener(roomId);
    } catch {
      // keep notifications best-effort
    }
  });
}

export function subscribeRoomUpdates(listener) {
  roomUpdateSubscribers.add(listener);
  return () => {
    roomUpdateSubscribers.delete(listener);
  };
}

export function getRoomSnapshot(roomId, viewerUsername = "") {
  const normalizedRoomId = String(roomId || "").trim().toUpperCase();
  if (!normalizedRoomId) {
    return null;
  }
  const room = rooms.get(normalizedRoomId);
  if (!room) {
    return null;
  }
  return serializeRoom(room, viewerUsername);
}

function generateRoomId() {
  let roomId = "";
  for (let index = 0; index < ROOM_ID_LENGTH; index += 1) {
    roomId += ROOM_ID_CHARS[randomInt(0, ROOM_ID_CHARS.length)];
  }
  return roomId;
}

function createUniqueRoomId() {
  let roomId = generateRoomId();
  while (rooms.has(roomId)) {
    roomId = generateRoomId();
  }
  return roomId;
}

function buildMessage(type, username, text) {
  return {
    id: `msg_${Date.now()}_${randomInt(1000, 9999)}`,
    type,
    username,
    text,
    ts: Date.now()
  };
}

function sanitizePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points
    .map((point) => ({
      x: Number(point?.x),
      y: Number(point?.y)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function maskWord(word) {
  return String(word || "").replace(/[A-Za-z0-9]/g, "_");
}

function findPlayer(room, username) {
  return room.players.find((player) => player.toLowerCase() === username.toLowerCase()) || null;
}

function pickWord() {
  return WORDS[randomInt(0, WORDS.length)];
}

function serializeRoom(room, viewerUsername = "") {
  const normalizedViewer = String(viewerUsername || "").trim().toLowerCase();
  const isDrawer = normalizedViewer && room.drawer?.toLowerCase() === normalizedViewer;
  const hostName = room.creator || room.host;
  const wordDisplay = room.phase === "playing"
    ? (isDrawer ? room.word : maskWord(room.word))
    : "";

  return {
    roomId: room.id,
    phase: room.phase,
    host: hostName,
    drawer: room.drawer,
    players: [...room.players]
      .map((name) => ({ name, score: room.scores[name] || 0 }))
      .sort((left, right) => right.score - left.score),
    wordDisplay,
    canDraw: Boolean(isDrawer),
    guessedPlayers: Array.from(room.guessedPlayers),
    messages: room.messages.map((message) => ({ ...message })),
    strokes: room.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) }))
  };
}

readPersistedRooms();

router.get("/", (_req, res) => {
  const roomSummaries = Array.from(rooms.values()).map((room) => ({
    roomId: room.id,
    phase: room.phase,
    playerCount: room.players.length
  }));
  res.json({ rooms: roomSummaries });
});

router.get("/:roomId", (req, res) => {
  const roomId = String(req.params.roomId || "").trim().toUpperCase();
  const username = String(req.query.username || "").trim();
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }

  res.json(serializeRoom(room, username));
});

router.post("/create", (req, res) => {
  const username = String(req.body?.username || "").trim();

  if (!username) {
    res.status(400).json({ error: "Username is required." });
    return;
  }

  const roomId = createUniqueRoomId();
  const room = {
    id: roomId,
    phase: "lobby",
    creator: username,
    host: username,
    drawer: null,
    word: "",
    players: [username],
    scores: { [username]: 0 },
    guessedPlayers: new Set(),
    messages: [],
    strokes: [],
    createdAt: Date.now()
  };

  rooms.set(roomId, room);
  writePersistedRooms();
  notifyRoomUpdated(roomId);
  res.status(201).json({ ...serializeRoom(room, username), username });
});

router.post("/join", (req, res) => {
  const roomId = String(req.body?.roomId || "").trim().toUpperCase();
  const username = String(req.body?.username || "").trim();

  if (!roomId || !username) {
    res.status(400).json({ error: "Room ID and username are required." });
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }

  const existingPlayer = findPlayer(room, username);
  const resolvedPlayerName = existingPlayer || username;

  if (!existingPlayer) {
    room.players.push(username);
    room.scores[username] = room.scores[username] || 0;
    writePersistedRooms();
    notifyRoomUpdated(roomId);
  }

  res.json({
    ...serializeRoom(room, resolvedPlayerName),
    username: resolvedPlayerName
  });
});

router.post("/:roomId/start", (req, res) => {
  const roomId = String(req.params.roomId || "").trim().toUpperCase();
  const username = String(req.body?.username || "").trim();
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }
  if (!username) {
    res.status(400).json({ error: "Username is required." });
    return;
  }
  if (room.players.length < 2) {
    res.status(400).json({ error: "At least two players are required." });
    return;
  }

  const resolvedPlayer = findPlayer(room, username);
  if (!resolvedPlayer) {
    res.status(403).json({ error: "You are not in this room." });
    return;
  }
  const hostName = room.creator || room.host;
  if (hostName.toLowerCase() !== resolvedPlayer.toLowerCase()) {
    res.status(403).json({ error: "Only the host can start the game." });
    return;
  }

  room.phase = "playing";
  room.drawer = hostName;
  room.word = pickWord();
  room.strokes = [];
  room.guessedPlayers = new Set();
  room.messages = [
    buildMessage("system", "System", "Round started. Start guessing!")
  ];
  writePersistedRooms();
  notifyRoomUpdated(roomId);

  res.json(serializeRoom(room, resolvedPlayer));
});

router.post("/:roomId/guess", (req, res) => {
  const roomId = String(req.params.roomId || "").trim().toUpperCase();
  const username = String(req.body?.username || "").trim();
  const text = String(req.body?.text || "").trim();
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }
  if (room.phase !== "playing") {
    res.status(400).json({ error: "The round has not started." });
    return;
  }
  if (!username || !text) {
    res.status(400).json({ error: "Username and guess text are required." });
    return;
  }

  const resolvedPlayer = findPlayer(room, username);
  if (!resolvedPlayer) {
    res.status(403).json({ error: "You are not in this room." });
    return;
  }
  if (room.drawer?.toLowerCase() === resolvedPlayer.toLowerCase()) {
    res.status(403).json({ error: "Drawer cannot send guesses." });
    return;
  }

  room.messages.push(buildMessage("guess", resolvedPlayer, text));

  if (text.toLowerCase() === room.word.toLowerCase() && !room.guessedPlayers.has(resolvedPlayer)) {
    room.guessedPlayers.add(resolvedPlayer);
    const guessOrder = room.guessedPlayers.size;
    const guesserPoints = Math.max(120 - (guessOrder - 1) * 30, 30);
    const drawerPoints = 15;

    room.scores[resolvedPlayer] = (room.scores[resolvedPlayer] || 0) + guesserPoints;
    if (room.drawer) {
      room.scores[room.drawer] = (room.scores[room.drawer] || 0) + drawerPoints;
    }

    room.messages.push(
      buildMessage(
        "system",
        "System",
        `${resolvedPlayer} guessed the word! +${guesserPoints} points.`
      )
    );
  }

  writePersistedRooms();
  notifyRoomUpdated(roomId);

  res.json(serializeRoom(room, resolvedPlayer));
});

router.post("/:roomId/strokes", (req, res) => {
  const roomId = String(req.params.roomId || "").trim().toUpperCase();
  const username = String(req.body?.username || "").trim();
  const stroke = req.body?.stroke;
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }
  if (room.phase !== "playing") {
    res.status(400).json({ error: "The round has not started." });
    return;
  }

  const resolvedPlayer = findPlayer(room, username);
  if (!resolvedPlayer) {
    res.status(403).json({ error: "You are not in this room." });
    return;
  }
  if (room.drawer?.toLowerCase() !== resolvedPlayer.toLowerCase()) {
    res.status(403).json({ error: "Only the drawer can draw." });
    return;
  }

  const mode = stroke?.mode === "fill" ? "fill" : "stroke";
  const points = sanitizePoints(stroke?.points);

  if (mode === "stroke" && points.length < 2) {
    res.status(400).json({ error: "Stroke requires at least two points." });
    return;
  }

  const normalizedStroke = {
    id: `stroke_${Date.now()}_${randomInt(1000, 9999)}`,
    mode,
    color: typeof stroke?.color === "string" ? stroke.color : "#f55a42",
    size: Math.max(1, Math.min(24, Number(stroke?.size) || 4)),
    points
  };

  room.strokes.push(normalizedStroke);
  if (room.strokes.length > 800) {
    room.strokes = room.strokes.slice(room.strokes.length - 800);
  }
  scheduleRoomsPersist();
  notifyRoomUpdated(roomId);

  res.status(201).json({ ok: true });
});

router.post("/:roomId/undo", (req, res) => {
  const roomId = String(req.params.roomId || "").trim().toUpperCase();
  const username = String(req.body?.username || "").trim();
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }

  const resolvedPlayer = findPlayer(room, username);
  if (!resolvedPlayer) {
    res.status(403).json({ error: "You are not in this room." });
    return;
  }
  if (room.drawer?.toLowerCase() !== resolvedPlayer.toLowerCase()) {
    res.status(403).json({ error: "Only the drawer can undo." });
    return;
  }

  if (room.strokes.length > 0) {
    room.strokes.pop();
    writePersistedRooms();
    notifyRoomUpdated(roomId);
  }

  res.json({ ok: true });
});

router.post("/:roomId/clear", (req, res) => {
  const roomId = String(req.params.roomId || "").trim().toUpperCase();
  const username = String(req.body?.username || "").trim();
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }

  const resolvedPlayer = findPlayer(room, username);
  if (!resolvedPlayer) {
    res.status(403).json({ error: "You are not in this room." });
    return;
  }
  if (room.drawer?.toLowerCase() !== resolvedPlayer.toLowerCase()) {
    res.status(403).json({ error: "Only the drawer can clear the canvas." });
    return;
  }

  room.strokes = [];
  writePersistedRooms();
  notifyRoomUpdated(roomId);
  res.json({ ok: true });
});

export default router;
