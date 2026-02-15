import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch } from "./hooks";
import { applyRoomSnapshot, clearError, setError, type RoomSnapshot } from "./store";

const ROOM_NOT_FOUND_ERROR = "Room not found.";
const RECONNECT_DELAY_MS = 900;

type RoomSocketOptions = {
  roomId: string;
  username: string;
};

type SocketSnapshotMessage = {
  type: "snapshot";
  snapshot: unknown;
};

type SocketRoomMissingMessage = {
  type: "room_missing";
};

type SocketErrorMessage = {
  type: "error";
  error?: unknown;
};

type SocketMessage = SocketSnapshotMessage | SocketRoomMissingMessage | SocketErrorMessage;

function resolveSocketUrl() {
  const explicitUrl = import.meta.env.VITE_WS_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl);
      parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      parsed.pathname = "/ws";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      // ignore invalid api url and fallback below
    }
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8080/ws`;
}

export function useRoomSocket({ roomId, username }: RoomSocketOptions) {
  const dispatch = useAppDispatch();
  const wsUrl = useMemo(resolveSocketUrl, []);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(false);

  useEffect(() => {
    if (!roomId || !username) {
      return;
    }

    shouldReconnectRef.current = true;

    const connect = () => {
      if (!shouldReconnectRef.current) {
        return;
      }

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        dispatch(clearError());
        socket.send(JSON.stringify({ type: "subscribe", roomId, username }));
      });

      socket.addEventListener("message", (event) => {
        let payload: SocketMessage;
        try {
          payload = JSON.parse(String(event.data || ""));
        } catch {
          return;
        }

        if (payload.type === "snapshot" && payload.snapshot) {
          dispatch(applyRoomSnapshot(payload.snapshot as RoomSnapshot));
          return;
        }

        if (payload.type === "room_missing") {
          dispatch(setError(ROOM_NOT_FOUND_ERROR));
          return;
        }

        if (payload.type === "error") {
          const message = typeof payload.error === "string" ? payload.error : "Socket connection error.";
          dispatch(setError(message));
        }
      });

      socket.addEventListener("error", () => {
        socket.close();
      });

      socket.addEventListener("close", () => {
        if (!shouldReconnectRef.current) {
          return;
        }
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const socket = socketRef.current;
      socketRef.current = null;
      if (!socket) {
        return;
      }

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [dispatch, roomId, username, wsUrl]);
}
