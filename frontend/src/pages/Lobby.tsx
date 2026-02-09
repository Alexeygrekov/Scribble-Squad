import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchRoom, leaveLobby } from "../store";

const LOBBY_REFRESH_MS = 2000;
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
  const { roomId, username, players, error } = useAppSelector((state) => state.connection);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const displayRoomId = roomId || routeRoomId || "";

  useEffect(() => {
    if (!roomId) {
      return;
    }

    void dispatch(fetchRoom({ roomId }));
    const timerId = window.setInterval(() => {
      void dispatch(fetchRoom({ roomId }));
    }, LOBBY_REFRESH_MS);

    return () => window.clearInterval(timerId);
  }, [dispatch, roomId]);

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
    } catch {
      // ignore storage write failures
    }
    dispatch(leaveLobby());
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
            {players.map((player, index) => (
              <li
                key={`${player}-${index}`}
                className="flex items-center justify-between border-b border-zinc-400 py-4 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-300 text-sm font-bold uppercase text-zinc-700">
                    {player.slice(0, 1)}
                  </span>
                  <span className="text-2xl font-semibold text-zinc-800">
                    {player}
                    {player.toLowerCase() === username.toLowerCase() ? " (you)" : ""}
                  </span>
                </div>
                {index === 0 && (
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
          className="mt-5 w-full bg-[#ff5a4a] px-4 py-4 text-center font-['Bebas_Neue'] text-5xl leading-none tracking-wide text-white transition hover:bg-[#ff4c3a]"
        >
          Start Game
        </button>

        {error && <p className="mt-4 text-sm font-semibold text-red-100">{error}</p>}
      </main>
    </div>
  );
}
