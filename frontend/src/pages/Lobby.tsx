import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchRoom, leaveLobby, startGame } from "../store";

const LOBBY_REFRESH_MS = 1200;
const SESSION_KEY = "scribble_squad_tab_session";

type LobbyProps = {
  routeRoomId?: string;
};

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export default function Lobby({ routeRoomId }: LobbyProps) {
  const dispatch = useAppDispatch();
  const {
    roomId,
    username,
    players,
    host,
    phase,
    status,
    error
  } = useAppSelector((state) => state.connection);

  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const displayRoomId = roomId || routeRoomId || "";
  const isHost = host.toLowerCase() === username.toLowerCase();
  const canStart = isHost && players.length >= 2 && phase !== "playing" && status !== "loading";

  useEffect(() => {
    if (!displayRoomId || !username) {
      return;
    }

    void dispatch(fetchRoom({ roomId: displayRoomId, username }));
    const timerId = window.setInterval(() => {
      void dispatch(fetchRoom({ roomId: displayRoomId, username }));
    }, LOBBY_REFRESH_MS);

    return () => window.clearInterval(timerId);
  }, [dispatch, displayRoomId, username]);

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timerId = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timerId);
  }, [copyState]);

  async function handleCopyRoomId() {
    try {
      if (!displayRoomId) {
        throw new Error("No room ID");
      }
      await copyToClipboard(displayRoomId);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function handleGoHome() {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      // ignore storage write failures
    }
    dispatch(leaveLobby());
  }

  function handleStartGame() {
    if (!canStart) {
      return;
    }
    void dispatch(startGame({ roomId: displayRoomId, username }));
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7] px-4 py-6 sm:px-8 sm:py-8">
      <button
        type="button"
        className="rounded-md bg-white/20 px-4 py-2 text-sm font-bold tracking-wide text-white transition hover:bg-white/30"
        onClick={handleGoHome}
      >
        Home
      </button>

      <main className="mx-auto mt-8 w-full max-w-5xl">
        <h1 className="font-['Bebas_Neue'] text-6xl leading-none tracking-widest text-white">Lobby</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-white">
          <p className="text-3xl font-semibold tracking-wide">
            Game ID: <span className="font-black">{displayRoomId}</span>
          </p>
          <button
            type="button"
            className="rounded bg-white/20 px-3 py-1.5 text-sm font-bold tracking-wide text-white transition hover:bg-white/30"
            onClick={handleCopyRoomId}
          >
            {copyState === "copied" ? "Copied" : "Copy ID"}
          </button>
          {copyState === "error" && <span className="text-sm font-semibold text-red-100">Copy failed</span>}
        </div>

        <section className="mt-6 rounded-lg bg-zinc-100 p-4 shadow-[0_12px_25px_rgba(0,0,0,0.15)] sm:p-6">
          <ul className="max-h-[48vh] overflow-y-auto">
            {players.map((player) => (
              <li
                key={player.name}
                className="flex items-center justify-between border-b border-zinc-400 py-4 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-300 text-sm font-bold uppercase text-zinc-700">
                    {player.name.slice(0, 1)}
                  </span>
                  <span className="text-2xl font-semibold text-zinc-800">
                    {player.name}
                    {player.name.toLowerCase() === username.toLowerCase() ? " (you)" : ""}
                  </span>
                </div>
                {player.name.toLowerCase() === host.toLowerCase() && (
                  <span className="rounded bg-orange-500 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    Host
                  </span>
                )}
              </li>
            ))}
            {players.length === 0 && <li className="py-5 text-xl font-semibold text-zinc-600">Waiting for players...</li>}
          </ul>
        </section>

        <button
          type="button"
          className="mt-5 w-full bg-[#ff5a4a] px-4 py-4 text-center font-['Bebas_Neue'] text-5xl leading-none tracking-wide text-white transition enabled:hover:bg-[#ff4c3a] disabled:cursor-not-allowed disabled:opacity-65"
          disabled={!canStart}
          onClick={handleStartGame}
        >
          {isHost ? (status === "loading" ? "Starting..." : "Start Game") : "Waiting For Host..."}
        </button>

        {!isHost && (
          <p className="mt-3 text-sm font-semibold text-white/90">
            Only the host can start the game.
          </p>
        )}
        {isHost && players.length < 2 && (
          <p className="mt-3 text-sm font-semibold text-white/90">
            At least 2 players are required to start.
          </p>
        )}
        {error && <p className="mt-4 text-sm font-semibold text-red-100">{error}</p>}
      </main>
    </div>
  );
}
