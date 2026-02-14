import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import { useAppDispatch, useAppSelector } from "./hooks";
import { joinGame } from "./store";

const SESSION_KEY = "scribble_squad_tab_session";

type StoredSession = {
  roomId: string;
  username: string;
};

type RouteState =
  | { kind: "home" }
  | { kind: "lobby"; roomId: string }
  | { kind: "room"; roomId: string }
  | { kind: "unknown" };

function normalizePath(pathname: string) {
  if (pathname.length <= 1) {
    return "/";
  }
  return pathname.replace(/\/+$/, "");
}

function parseRoute(pathname: string): RouteState {
  if (pathname === "/") {
    return { kind: "home" };
  }

  const lobbyMatch = pathname.match(/^\/lobby\/([A-Za-z0-9_-]+)$/i);
  if (lobbyMatch) {
    return { kind: "lobby", roomId: lobbyMatch[1].toUpperCase() };
  }

  const roomMatch = pathname.match(/^\/room\/([A-Za-z0-9_-]+)$/i);
  if (roomMatch) {
    return { kind: "room", roomId: roomMatch[1].toUpperCase() };
  }

  return { kind: "unknown" };
}

function readStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    const roomId = String(parsed.roomId || "").toUpperCase();
    const username = String(parsed.username || "").trim();
    if (!roomId || !username) {
      return null;
    }
    return { roomId, username };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage write failures
  }
}

function clearStoredSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore storage write failures
  }
}

export default function App() {
  const dispatch = useAppDispatch();
  const { status, roomId, username, phase } = useAppSelector((state) => state.connection);
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));
  const route = useMemo(() => parseRoute(pathname), [pathname]);
  const [isRestoring, setIsRestoring] = useState(() => route.kind === "lobby" || route.kind === "room");
  const attemptedRestoreRef = useRef<string | null>(null);

  const navigate = useCallback((nextPath: string, replace = false) => {
    const normalizedNextPath = normalizePath(nextPath);
    if (normalizePath(window.location.pathname) === normalizedNextPath) {
      return;
    }

    if (replace) {
      window.history.replaceState(null, "", normalizedNextPath);
    } else {
      window.history.pushState(null, "", normalizedNextPath);
    }
    setPathname(normalizedNextPath);
  }, []);

  useEffect(() => {
    const onPopState = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (route.kind === "unknown") {
      navigate("/", true);
    }
  }, [navigate, route.kind]);

  useEffect(() => {
    if (status === "connected" && roomId && username) {
      writeStoredSession({ roomId, username });

      if (phase === "playing" && route.kind !== "room") {
        navigate(`/room/${roomId}`, true);
      }
      if (phase !== "playing" && route.kind !== "lobby") {
        navigate(`/lobby/${roomId}`, true);
      }

      setIsRestoring(false);
      return;
    }

    if (route.kind === "home" && status !== "loading") {
      clearStoredSession();
      setIsRestoring(false);
    }
  }, [navigate, phase, roomId, route.kind, status, username]);

  useEffect(() => {
    if (route.kind !== "lobby" && route.kind !== "room") {
      attemptedRestoreRef.current = null;
      setIsRestoring(false);
      return;
    }

    const routeRoomId = route.roomId;
    const connectedToRoute = status === "connected" && roomId === routeRoomId && Boolean(username);
    if (connectedToRoute || status === "loading") {
      return;
    }

    if (attemptedRestoreRef.current === routeRoomId) {
      setIsRestoring(false);
      navigate("/", true);
      return;
    }

    attemptedRestoreRef.current = routeRoomId;
    setIsRestoring(true);

    const storedSession = readStoredSession();
    if (!storedSession || storedSession.roomId !== routeRoomId) {
      setIsRestoring(false);
      navigate("/", true);
      return;
    }

    void dispatch(joinGame({ roomId: routeRoomId, username: storedSession.username }));
  }, [dispatch, navigate, roomId, route, status, username]);

  if ((route.kind === "lobby" || route.kind === "room") && isRestoring && status !== "connected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7]">
        <p className="font-['Bebas_Neue'] text-5xl tracking-wider text-white">Loading...</p>
      </div>
    );
  }

  if (route.kind === "lobby") {
    return <Lobby routeRoomId={route.roomId} />;
  }

  if (route.kind === "room") {
    return <Room routeRoomId={route.roomId} />;
  }

  return <Home />;
}
