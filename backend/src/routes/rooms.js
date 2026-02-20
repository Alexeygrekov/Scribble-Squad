import { randomInt } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Router } from "express";
import { fileURLToPath } from "url";

const router = Router();

const rooms = new Map();
const roundTimeouts = new Map();

const ROOM_ID_LENGTH = 6;
const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHOOSE_WORD_OPTIONS = 3;
const ROUND_DURATION_MS = 90_000;
const MAX_CHAT_MESSAGES = 220;
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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toOrdinal(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return String(value);
  }
  const integerValue = Math.floor(numberValue);
  const abs = Math.abs(integerValue);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${integerValue}st`;
  }
  if (mod10 === 2 && mod100 !== 12) {
    return `${integerValue}nd`;
  }
  if (mod10 === 3 && mod100 !== 13) {
    return `${integerValue}rd`;
  }
  return `${integerValue}th`;
}

function shufflePlayers(players) {
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pickedIndex = randomInt(0, index + 1);
    [shuffled[index], shuffled[pickedIndex]] = [shuffled[pickedIndex], shuffled[index]];
  }
  return shuffled;
}

function pickWordChoices(count = CHOOSE_WORD_OPTIONS) {
  if (WORDS.length === 0) {
    return [];
  }

  const pool = [...WORDS];
  const pickCount = Math.min(Math.max(1, count), pool.length);
  const picks = [];

  while (picks.length < pickCount) {
    const pickedIndex = randomInt(0, pool.length);
    picks.push(pool[pickedIndex]);
    pool.splice(pickedIndex, 1);
  }

  return picks;
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

function sanitizeQueue(queue, players) {
  if (!Array.isArray(queue)) {
    return [];
  }

  const normalizedPlayerSet = new Set(players.map((player) => player.toLowerCase()));
  const exactByNormalized = new Map(players.map((player) => [player.toLowerCase(), player]));
  const seen = new Set();

  return queue
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((entry) => entry.toLowerCase())
    .filter((entryLower) => normalizedPlayerSet.has(entryLower))
    .filter((entryLower) => {
      if (seen.has(entryLower)) {
        return false;
      }
      seen.add(entryLower);
      return true;
    })
    .map((entryLower) => exactByNormalized.get(entryLower))
    .filter(Boolean);
}

function clearRoundTimeout(roomId) {
  const timeoutHandle = roundTimeouts.get(roomId);
  if (!timeoutHandle) {
    return;
  }
  clearTimeout(timeoutHandle);
  roundTimeouts.delete(roomId);
}

function buildMessage(type, username, text, options = {}) {
  const privateTo = typeof options.privateTo === "string" ? options.privateTo.trim() : "";

  return {
    id: `msg_${Date.now()}_${randomInt(1000, 9999)}`,
    type,
    username,
    text,
    ts: Date.now(),
    privateTo: privateTo || null
  };
}

function appendMessage(room, message) {
  room.messages.push(message);
  if (room.messages.length > MAX_CHAT_MESSAGES) {
    room.messages = room.messages.slice(room.messages.length - MAX_CHAT_MESSAGES);
  }
}

function takeNextDrawer(room, previousDrawer = "") {
  room.firstPassQueue = sanitizeQueue(room.firstPassQueue, room.players);
  room.secondPassQueue = sanitizeQueue(room.secondPassQueue, room.players);

  if (room.firstPassQueue.length === 0 && room.secondPassQueue.length === 0 && room.roundsCompleted < room.totalRounds) {
    room.secondPassQueue = shufflePlayers(room.players);

    if (previousDrawer && room.secondPassQueue.length > 1) {
      const previousLower = previousDrawer.toLowerCase();
      if (room.secondPassQueue[0].toLowerCase() === previousLower) {
        const swapIndex = room.secondPassQueue.findIndex((playerName, index) => (
          index > 0 && playerName.toLowerCase() !== previousLower
        ));

        if (swapIndex > 0) {
          [room.secondPassQueue[0], room.secondPassQueue[swapIndex]] = [room.secondPassQueue[swapIndex], room.secondPassQueue[0]];
        }
      }
    }
  }

  if (room.firstPassQueue.length > 0) {
    return room.firstPassQueue.shift() || null;
  }

  if (room.secondPassQueue.length > 0) {
    return room.secondPassQueue.shift() || null;
  }

  return null;
}

function enterChoosingWordPhase(room, drawerName) {
  clearRoundTimeout(room.id);

  room.phase = "choosing_word";
  room.drawer = drawerName;
  room.word = "";
  room.wordChoices = pickWordChoices(CHOOSE_WORD_OPTIONS);
  room.strokes = [];
  room.guessedPlayers = new Set();
  room.roundEndsAt = 0;

  appendMessage(room, buildMessage("system", "System", `${drawerName} is picking a word...`));
}

function finishGame(room, reason) {
  clearRoundTimeout(room.id);

  room.phase = "game_over";
  room.drawer = null;
  room.word = "";
  room.wordChoices = [];
  room.strokes = [];
  room.guessedPlayers = new Set();
  room.roundEndsAt = 0;

  if (reason) {
    appendMessage(room, buildMessage("system", "System", reason));
  }
}

function getTotalGuessers(room) {
  if (!room.drawer) {
    return 0;
  }
  return room.players.filter((playerName) => playerName.toLowerCase() !== room.drawer.toLowerCase()).length;
}

function completeActiveRound(room, reasonMessage) {
  if (room.phase !== "playing") {
    return;
  }

  const previousDrawer = room.drawer || "";
  clearRoundTimeout(room.id);

  room.roundEndsAt = 0;
  room.word = "";
  room.wordChoices = [];
  room.strokes = [];
  room.guessedPlayers = new Set();

  if (reasonMessage) {
    appendMessage(room, buildMessage("system", "System", reasonMessage));
  }

  room.roundsCompleted = clampNumber(room.roundsCompleted + 1, 0, room.totalRounds || room.players.length * 2);

  if (room.roundsCompleted >= room.totalRounds) {
    finishGame(room, "Game over! Everyone has drawn twice.");
    return;
  }

  const nextDrawer = takeNextDrawer(room, previousDrawer);
  if (!nextDrawer) {
    finishGame(room, "Game over! Everyone has drawn twice.");
    return;
  }

  room.roundNumber = room.roundsCompleted + 1;
  enterChoosingWordPhase(room, nextDrawer);
}

function scheduleRoundTimeout(room) {
  clearRoundTimeout(room.id);

  if (room.phase !== "playing" || !Number.isFinite(room.roundEndsAt) || room.roundEndsAt <= 0) {
    return;
  }

  const waitMs = Math.max(0, room.roundEndsAt - Date.now());

  const timeoutHandle = setTimeout(() => {
    const latestRoom = rooms.get(room.id);
    if (!latestRoom || latestRoom.phase !== "playing") {
      return;
    }

    const revealedWord = latestRoom.word;
    completeActiveRound(latestRoom, `Time is up! The word was ${revealedWord.toUpperCase()}.`);
    writePersistedRooms();
    notifyRoomUpdated(latestRoom.id);
  }, waitMs + 15);

  roundTimeouts.set(room.id, timeoutHandle);
}

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
    const scoreValue = Number(rawRoom?.scores?.[player]);
    scores[player] = Number.isFinite(scoreValue) ? scoreValue : 0;
  });

  const guessedPlayersArray = Array.isArray(rawRoom?.guessedPlayers)
    ? rawRoom.guessedPlayers
      .map((player) => String(player || "").trim())
      .filter((player) => players.some((name) => name.toLowerCase() === player.toLowerCase()))
    : [];

  const guessedPlayers = new Set(guessedPlayersArray);

  const messages = Array.isArray(rawRoom?.messages)
    ? rawRoom.messages
      .map((message) => {
        const text = String(message?.text || "").trim();
        if (!text) {
          return null;
        }

        const messageType = message?.type === "guess" || message?.type === "success"
          ? message.type
          : "system";

        const privateTo = typeof message?.privateTo === "string" && message.privateTo.trim()
          ? message.privateTo.trim()
          : null;

        return {
          id: typeof message?.id === "string" ? message.id : `msg_${Date.now()}_${randomInt(1000, 9999)}`,
          type: messageType,
          username: String(message?.username || "System").trim() || "System",
          text,
          ts: Number.isFinite(Number(message?.ts)) ? Number(message.ts) : Date.now(),
          privateTo
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
          size: clampNumber(Number(stroke?.size) || 4, 1, 24),
          points
        };
      })
      .filter(Boolean)
    : [];

  const drawerCandidate = String(rawRoom?.drawer || "").trim();
  const drawer = players.find((player) => player.toLowerCase() === drawerCandidate.toLowerCase()) || null;

  const phase = rawRoom?.phase === "playing" || rawRoom?.phase === "choosing_word" || rawRoom?.phase === "game_over"
    ? rawRoom.phase
    : "lobby";

  let wordChoices = Array.isArray(rawRoom?.wordChoices)
    ? rawRoom.wordChoices
      .map((word) => String(word || "").trim())
      .filter(Boolean)
      .slice(0, CHOOSE_WORD_OPTIONS)
    : [];

  if (phase === "choosing_word" && wordChoices.length === 0) {
    wordChoices = pickWordChoices(CHOOSE_WORD_OPTIONS);
  }

  const totalRoundsFromStore = Number(rawRoom?.totalRounds);
  const totalRounds = Number.isFinite(totalRoundsFromStore) && totalRoundsFromStore > 0
    ? Math.floor(totalRoundsFromStore)
    : players.length * 2;

  const roundsCompletedFromStore = Number(rawRoom?.roundsCompleted);
  const roundsCompleted = clampNumber(
    Number.isFinite(roundsCompletedFromStore) ? Math.floor(roundsCompletedFromStore) : 0,
    0,
    totalRounds
  );

  const roundNumberFromStore = Number(rawRoom?.roundNumber);
  const roundNumber = clampNumber(
    Number.isFinite(roundNumberFromStore) ? Math.floor(roundNumberFromStore) : Math.max(1, roundsCompleted + 1),
    1,
    Math.max(1, totalRounds)
  );

  const roundEndsAtRaw = Number(rawRoom?.roundEndsAt);
  const roundEndsAt = Number.isFinite(roundEndsAtRaw) && roundEndsAtRaw > 0 ? roundEndsAtRaw : 0;

  const firstPassQueue = sanitizeQueue(rawRoom?.firstPassQueue, players);
  const secondPassQueue = sanitizeQueue(rawRoom?.secondPassQueue, players);

  return {
    id: roomId,
    phase,
    creator,
    host: creator,
    drawer,
    word: typeof rawRoom?.word === "string" ? rawRoom.word : "",
    wordChoices,
    players,
    scores,
    guessedPlayers,
    messages,
    strokes,
    roundEndsAt,
    roundNumber,
    totalRounds,
    roundsCompleted,
    firstPassQueue,
    secondPassQueue,
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

function serializeRoom(room, viewerUsername = "") {
  const normalizedViewer = String(viewerUsername || "").trim().toLowerCase();
  const isDrawer = normalizedViewer && room.drawer?.toLowerCase() === normalizedViewer;
  const hostName = room.creator || room.host;
  const canDraw = room.phase === "playing" && Boolean(isDrawer);
  const wordChoices = room.phase === "choosing_word" && isDrawer
    ? [...room.wordChoices]
    : [];
  const wordDisplay = room.phase === "playing"
    ? (isDrawer ? room.word : maskWord(room.word))
    : "";

  const visibleMessages = room.messages
    .filter((message) => !message.privateTo || message.privateTo.toLowerCase() === normalizedViewer)
    .map((message) => ({
      id: message.id,
      type: message.type,
      username: message.username,
      text: message.text,
      ts: message.ts
    }));

  return {
    roomId: room.id,
    phase: room.phase,
    host: hostName,
    drawer: room.drawer,
    players: [...room.players]
      .map((name) => ({ name, score: room.scores[name] || 0 }))
      .sort((left, right) => right.score - left.score),
    wordDisplay,
    wordChoices,
    canDraw,
    guessedPlayers: Array.from(room.guessedPlayers),
    messages: visibleMessages,
    strokes: room.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point }))
    })),
    roundEndsAt: room.phase === "playing" ? room.roundEndsAt : 0,
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    roundsCompleted: room.roundsCompleted
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

function recoverRunningRoundsAfterBoot() {
  let changed = false;

  rooms.forEach((room) => {
    if (room.phase !== "playing") {
      return;
    }

    if (room.roundEndsAt > Date.now()) {
      scheduleRoundTimeout(room);
      return;
    }

    const revealedWord = room.word;
    completeActiveRound(room, `Time is up! The word was ${revealedWord.toUpperCase()}.`);
    changed = true;
  });

  if (changed) {
    writePersistedRooms();
  }
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

readPersistedRooms();
recoverRunningRoundsAfterBoot();

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
    wordChoices: [],
    players: [username],
    scores: { [username]: 0 },
    guessedPlayers: new Set(),
    messages: [],
    strokes: [],
    roundEndsAt: 0,
    roundNumber: 1,
    totalRounds: 0,
    roundsCompleted: 0,
    firstPassQueue: [],
    secondPassQueue: [],
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

  if (!existingPlayer && room.phase !== "lobby") {
    res.status(400).json({ error: "Game already started. New players cannot join now." });
    return;
  }

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
  if (room.phase !== "lobby") {
    res.status(400).json({ error: "Game is already running." });
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

  room.players.forEach((playerName) => {
    room.scores[playerName] = 0;
  });

  const firstPassOrder = shufflePlayers(room.players);
  const pickedDrawer = firstPassOrder.shift() || null;
  if (!pickedDrawer) {
    res.status(500).json({ error: "Unable to select a drawer." });
    return;
  }

  room.totalRounds = room.players.length * 2;
  room.roundsCompleted = 0;
  room.roundNumber = 1;
  room.firstPassQueue = firstPassOrder;
  room.secondPassQueue = [];
  room.messages = [];
  room.word = "";
  room.wordChoices = [];
  room.strokes = [];
  room.guessedPlayers = new Set();

  enterChoosingWordPhase(room, pickedDrawer);

  writePersistedRooms();
  notifyRoomUpdated(roomId);

  res.json(serializeRoom(room, resolvedPlayer));
});

router.post("/:roomId/choose-word", (req, res) => {
  const roomId = String(req.params.roomId || "").trim().toUpperCase();
  const username = String(req.body?.username || "").trim();
  const selectedWordInput = String(req.body?.word || "").trim().toLowerCase();
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }
  if (!username || !selectedWordInput) {
    res.status(400).json({ error: "Username and word are required." });
    return;
  }
  if (room.phase !== "choosing_word") {
    res.status(400).json({ error: "Word selection is not active." });
    return;
  }

  const resolvedPlayer = findPlayer(room, username);
  if (!resolvedPlayer) {
    res.status(403).json({ error: "You are not in this room." });
    return;
  }
  if (room.drawer?.toLowerCase() !== resolvedPlayer.toLowerCase()) {
    res.status(403).json({ error: "Only the drawer can choose the word." });
    return;
  }

  const chosenWord = room.wordChoices.find((word) => word.toLowerCase() === selectedWordInput);
  if (!chosenWord) {
    res.status(400).json({ error: "Chosen word is not available." });
    return;
  }

  room.phase = "playing";
  room.word = chosenWord;
  room.wordChoices = [];
  room.strokes = [];
  room.guessedPlayers = new Set();
  room.roundEndsAt = Date.now() + ROUND_DURATION_MS;

  appendMessage(room, buildMessage("system", "System", "Round started. Start guessing!"));
  scheduleRoundTimeout(room);

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
  if (room.guessedPlayers.has(resolvedPlayer)) {
    res.status(400).json({ error: "You already guessed this word." });
    return;
  }

  const normalizedGuess = text.toLowerCase();
  const normalizedWord = room.word.toLowerCase();
  const isCorrectGuess = normalizedGuess === normalizedWord;

  if (!isCorrectGuess) {
    appendMessage(room, buildMessage("guess", resolvedPlayer, text));
  } else {
    room.guessedPlayers.add(resolvedPlayer);
    const guessOrder = room.guessedPlayers.size;
    const totalGuessers = getTotalGuessers(room);
    const guesserPoints = Math.max(120 - (guessOrder - 1) * 30, 30);
    const drawerPoints = 15;

    room.scores[resolvedPlayer] = (room.scores[resolvedPlayer] || 0) + guesserPoints;
    if (room.drawer) {
      room.scores[room.drawer] = (room.scores[room.drawer] || 0) + drawerPoints;
    }

    appendMessage(
      room,
      buildMessage(
        "success",
        "System",
        `You were correct! The word was ${room.word}. (${toOrdinal(guessOrder)} / ${totalGuessers} player${totalGuessers === 1 ? "" : "s"})`,
        { privateTo: resolvedPlayer }
      )
    );

    appendMessage(
      room,
      buildMessage(
        "system",
        "System",
        `${resolvedPlayer} guessed correctly! +${guesserPoints} points.`
      )
    );

    if (totalGuessers > 0 && room.guessedPlayers.size >= totalGuessers) {
      const revealedWord = room.word;
      completeActiveRound(room, `Round over! Everyone guessed the word ${revealedWord.toUpperCase()}.`);
    }
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
    size: clampNumber(Number(stroke?.size) || 4, 1, 24),
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
    res.status(403).json({ error: "Only the drawer can undo." });
    return;
  }

  if (room.strokes.length > 0) {
    room.strokes.pop();
    scheduleRoomsPersist();
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
    res.status(403).json({ error: "Only the drawer can clear the canvas." });
    return;
  }

  room.strokes = [];
  scheduleRoomsPersist();
  notifyRoomUpdated(roomId);
  res.json({ ok: true });
});

export default router;
