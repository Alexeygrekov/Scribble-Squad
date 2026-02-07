import { randomInt } from "crypto";
import { Router } from "express";

const router = Router();

const rooms = new Map();
const ROOM_ID_LENGTH = 6;
const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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

router.get("/", (_req, res) => {
  const roomSummaries = Array.from(rooms.values()).map((room) => ({
    id: room.id,
    players: room.players
  }));
  res.json({ rooms: roomSummaries });
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
    players: [username],
    createdAt: Date.now()
  };

  rooms.set(roomId, room);
  res.status(201).json({ roomId, username });
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

  const alreadyInRoom = room.players.some(
    (player) => player.toLowerCase() === username.toLowerCase()
  );
  if (!alreadyInRoom) {
    room.players.push(username);
  }

  res.json({ roomId, username });
});

export default router;
