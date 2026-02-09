import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import { useAppDispatch, useAppSelector } from "./hooks";
import { joinGame } from "./store";

const SESSION_KEY = "scribble_squad_tab_session";

type StoredSession = {
  roomId: string;
  username: string;
};

function getLobbyRoomId(pathname: string) {
  const match = pathname.match(/^\/lobby\/([A-Za-z0-9_-]+)$/);
  return match?.[1]?.toUpperCase() || null;
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
  const { status, roomId, username } = useAppSelector((state) => state.connection);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [isRestoringLobby, setIsRestoringLobby] = useState(() => Boolean(getLobbyRoomId(window.location.pathname)));
  const attemptedRestoreRef = useRef<string | null>(null);
  const routeRoomId = useMemo(() => getLobbyRoomId(pathname), [pathname]);

  const navigate = useCallback((nextPath: string, replace = false) => {
    if (window.location.pathname === nextPath) {
      return;
    }

    if (replace) {
      window.history.replaceState(null, "", nextPath);
    } else {
      window.history.pushState(null, "", nextPath);
    }
    setPathname(nextPath);
  }, []);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (status === "connected" && roomId && username) {
      writeStoredSession({ roomId, username });
      const lobbyPath = `/lobby/${roomId}`;
      if (pathname !== lobbyPath) {
        navigate(lobbyPath, true);
      }
      setIsRestoringLobby(false);
      return;
    }

    if (pathname === "/" && status !== "loading") {
      clearStoredSession();
      setIsRestoringLobby(false);
    }
  }, [navigate, pathname, roomId, status, username]);

  useEffect(() => {
    if (!routeRoomId) {
      attemptedRestoreRef.current = null;
      setIsRestoringLobby(false);
      return;
    }

    const connectedToRoute = status === "connected" && roomId === routeRoomId && Boolean(username);
    if (connectedToRoute || status === "loading") {
      return;
    }

    if (attemptedRestoreRef.current === routeRoomId) {
      setIsRestoringLobby(false);
      navigate("/", true);
      return;
    }

    attemptedRestoreRef.current = routeRoomId;
    setIsRestoringLobby(true);
    const storedSession = readStoredSession();
    if (!storedSession || storedSession.roomId !== routeRoomId) {
      setIsRestoringLobby(false);
      navigate("/", true);
      return;
    }

    void dispatch(joinGame({ roomId: routeRoomId, username: storedSession.username }));
  }, [dispatch, navigate, roomId, routeRoomId, status, username]);

  useEffect(() => {
    if (pathname !== "/" && !routeRoomId) {
      navigate("/", true);
    }
  }, [navigate, pathname, routeRoomId]);

  if (routeRoomId && isRestoringLobby && status !== "connected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7]">
        <p className="font-['Bebas_Neue'] text-5xl tracking-wider text-white">Loading Lobby...</p>
      </div>
    );
  }

  if (routeRoomId) {
    return <Lobby routeRoomId={routeRoomId} />;
  }

  return <Home />;
}
