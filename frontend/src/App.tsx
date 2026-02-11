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

function normalizePath(pathname: string) {
  if (pathname.length <= 1) {
    return "/";
  }
  return pathname.replace(/\/+$/, "");
}

function getLobbyRoomId(pathname: string) {
  const match = pathname.match(/^\/lobby\/([A-Za-z0-9_-]+)$/i);
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
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));
  const [isRestoringLobby, setIsRestoringLobby] = useState(() => Boolean(getLobbyRoomId(normalizePath(window.location.pathname))));
  const attemptedRestoreRef = useRef<string | null>(null);
  const normalizedPathname = useMemo(() => normalizePath(pathname), [pathname]);
  const routeRoomId = useMemo(() => getLobbyRoomId(normalizedPathname), [normalizedPathname]);
  const isLobbyPath = normalizedPathname.startsWith("/lobby/");

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
    if (status === "connected" && roomId && username) {
      writeStoredSession({ roomId, username });
      const lobbyPath = `/lobby/${roomId}`;
      if (normalizedPathname !== lobbyPath) {
        navigate(lobbyPath, true);
      }
      setIsRestoringLobby(false);
      return;
    }

    if (normalizedPathname === "/" && status !== "loading") {
      clearStoredSession();
      setIsRestoringLobby(false);
    }
  }, [navigate, normalizedPathname, roomId, status, username]);

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
    if (normalizedPathname !== "/" && !isLobbyPath) {
      navigate("/", true);
    }
  }, [isLobbyPath, navigate, normalizedPathname]);

  if (isLobbyPath && isRestoringLobby && status !== "connected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7]">
        <p className="font-['Bebas_Neue'] text-5xl tracking-wider text-white">Loading Lobby...</p>
      </div>
    );
  }

  if (isLobbyPath && routeRoomId) {
    return <Lobby routeRoomId={routeRoomId} />;
  }

  if (isLobbyPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7]">
        <p className="font-['Bebas_Neue'] text-5xl tracking-wider text-white">Lobby Not Found</p>
      </div>
    );
  }

  return <Home />;
}
