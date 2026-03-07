import { useEffect, useState, type FormEvent } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { clearError, createGame, joinGame, setError } from "../store";
import paintPaletteImage from "../assets/ui/paint_palette2.png";
import { playButtonClick, playHoverSnap } from "../sounds";

const inputClassName =
  "w-full border border-zinc-700 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none placeholder:text-slate-400 focus:border-zinc-900";
const buttonClassName =
  "w-full rounded-md border border-white/25 bg-[#ff5a4a] px-3 py-2 text-center font-['Bebas_Neue'] text-2xl tracking-wide text-white transition duration-150 enabled:hover:-translate-y-0.5 enabled:hover:scale-[1.01] enabled:hover:bg-[#ff4c3a] enabled:hover:ring-2 enabled:hover:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-60";

type HomeProps = {
  initialJoinRoomId?: string;
};

export default function Home({ initialJoinRoomId = "" }: HomeProps) {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.connection);
  const isLoading = status === "loading";

  const [joinRoomId, setJoinRoomId] = useState(initialJoinRoomId);
  const [joinUsername, setJoinUsername] = useState("");
  const [createUsername, setCreateUsername] = useState("");

  useEffect(() => {
    if (!initialJoinRoomId) {
      return;
    }
    setJoinRoomId(initialJoinRoomId);
  }, [initialJoinRoomId]);

  function handleJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    playButtonClick();
    const trimmedRoomId = joinRoomId.trim().toUpperCase();
    const trimmedUsername = joinUsername.trim();

    if (!trimmedRoomId || !trimmedUsername) {
      dispatch(setError("Game ID and username are required to join."));
      return;
    }

    dispatch(clearError());
    void dispatch(joinGame({ roomId: trimmedRoomId, username: trimmedUsername }));
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    playButtonClick();
    const trimmedUsername = createUsername.trim();

    if (!trimmedUsername) {
      dispatch(setError("Username is required to create a game."));
      return;
    }

    dispatch(clearError());
    void dispatch(createGame({ username: trimmedUsername }));
  }

  return (
    <div className="min-h-screen xl:h-[100dvh] xl:overflow-hidden">
      <div className="grid min-h-screen xl:h-[100dvh] xl:grid-cols-2">
        <section className="flex items-center justify-center bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7] px-6 py-10 sm:px-10">
          <div className="w-full max-w-2xl">
            <h1 className="font-['Bebas_Neue'] text-7xl leading-none tracking-wider text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.2)] sm:text-8xl">
              Scribble Squad
            </h1>
            <p className="mt-4 max-w-xl text-3xl font-semibold leading-tight text-white/95 sm:text-4xl">
              Compete with your friends in this fun and challenging drawing game
            </p>
            <img
              src={paintPaletteImage}
              alt="Paint palette and drawing hand"
              className="mt-8 w-full max-w-[620px] object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.25)]"
              draggable={false}
            />
          </div>
        </section>

        <section className="flex items-center justify-center bg-[#ff5a4a] px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm rounded-lg bg-[#ececec] p-6 shadow-[0_20px_35px_rgba(0,0,0,0.20)] sm:p-8">
            <form className="space-y-3" onSubmit={handleJoinSubmit}>
              <h2 className="font-['Bebas_Neue'] text-4xl leading-none tracking-wide text-zinc-950">
                Join Game
              </h2>
              <input
                className={inputClassName}
                placeholder="Game ID"
                value={joinRoomId}
                onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
                autoComplete="off"
              />
              <input
                className={inputClassName}
                placeholder="Username"
                value={joinUsername}
                onChange={(event) => setJoinUsername(event.target.value)}
                autoComplete="off"
              />
              <button className={buttonClassName} type="submit" disabled={isLoading} onMouseEnter={playHoverSnap}>
                {isLoading ? "Joining..." : "Join Game"}
              </button>
            </form>

            <p className="my-4 text-center text-2xl text-zinc-900">or</p>

            <form className="space-y-3" onSubmit={handleCreateSubmit}>
              <h2 className="font-['Bebas_Neue'] text-4xl leading-none tracking-wide text-zinc-950">
                Create Game
              </h2>
              <input
                className={inputClassName}
                placeholder="Username"
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                autoComplete="off"
              />
              <button className={buttonClassName} type="submit" disabled={isLoading} onMouseEnter={playHoverSnap}>
                {isLoading ? "Creating..." : "Create Game"}
              </button>
            </form>

            {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
