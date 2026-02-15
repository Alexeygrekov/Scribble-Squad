import express from "express";
import { createServer } from "http";
import cors from "cors";
import morgan from "morgan";
import { WebSocket, WebSocketServer } from "ws";
import "dotenv/config";
import healthRouter from "./routes/health.js";
import roomsRouter, { getRoomSnapshot, subscribeRoomUpdates } from "./routes/rooms.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: ORIGIN }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/health", healthRouter);
app.use("/api/rooms", roomsRouter);

app.use(errorHandler);

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const socketClients = new Set();

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

wss.on("connection", (socket) => {
  const client = {
    socket,
    roomId: "",
    username: ""
  };

  socketClients.add(client);

  socket.on("message", (rawMessage) => {
    let payload;
    try {
      payload = JSON.parse(String(rawMessage || ""));
    } catch {
      sendJson(socket, { type: "error", error: "Invalid message payload." });
      return;
    }

    if (payload?.type !== "subscribe") {
      sendJson(socket, { type: "error", error: "Unsupported message type." });
      return;
    }

    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const username = String(payload?.username || "").trim();
    if (!roomId || !username) {
      sendJson(socket, { type: "error", error: "roomId and username are required." });
      return;
    }

    client.roomId = roomId;
    client.username = username;

    const snapshot = getRoomSnapshot(roomId, username);
    if (!snapshot) {
      sendJson(socket, { type: "room_missing", roomId });
      return;
    }

    sendJson(socket, { type: "snapshot", snapshot });
  });

  socket.on("close", () => {
    socketClients.delete(client);
  });

  socket.on("error", () => {
    // ignore socket errors, close cleanup handles removal
  });
});

const unsubscribeRoomUpdates = subscribeRoomUpdates((roomId) => {
  socketClients.forEach((client) => {
    if (client.roomId !== roomId) {
      return;
    }

    const snapshot = getRoomSnapshot(roomId, client.username);
    if (!snapshot) {
      sendJson(client.socket, { type: "room_missing", roomId });
      return;
    }

    sendJson(client.socket, { type: "snapshot", snapshot });
  });
});

server.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

function handleShutdown() {
  unsubscribeRoomUpdates();
}

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
