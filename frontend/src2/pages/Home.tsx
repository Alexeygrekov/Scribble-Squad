import { useState, type FormEvent } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { clearError, createGame, joinGame, setError } from "../store";

const inputClassName =
  "w-full border border-zinc-700 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none placeholder:text-slate-400 focus:border-zinc-900";
const buttonClassName =
  "w-full bg-zinc-300 px-3 py-2 text-center font-['Bebas_Neue'] text-2xl tracking-wide text-zinc-900 transition enabled:hover:bg-zinc-400 disabled:cursor-not-allowed disabled:opacity-60";

export default function Home() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.connection);
  const isLoading = status === "loading";

  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinUsername, setJoinUsername] = useState("");
  const [createUsername, setCreateUsername] = useState("");

  function handleJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const trimmedUsername = createUsername.trim();

    if (!trimmedUsername) {
      dispatch(setError("Username is required to create a game."));
      return;
    }

    dispatch(clearError());
    void dispatch(createGame({ username: trimmedUsername }));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#ff6a4a] via-[#ff5a4a] to-[#ff4a53] px-4 py-10">
      <section className="w-full max-w-sm rounded-lg bg-[#ececec] p-6 shadow-[0_20px_35px_rgba(0,0,0,0.20)] sm:p-8">
        <h1 className="bg-gradient-to-r from-[#ff5a4a] via-[#ff7c3f] to-[#ffb22f] bg-clip-text text-center font-['Bebas_Neue'] text-6xl leading-none tracking-wider text-transparent drop-shadow-[0_2px_0_rgba(0,0,0,0.20)]">
          Scribble Squad
        </h1>

        <form className="mt-5 space-y-3" onSubmit={handleJoinSubmit}>
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
          <button className={buttonClassName} type="submit" disabled={isLoading}>
            {isLoading ? "Joining..." : "Join"}
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
          <button className={buttonClassName} type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Game"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
      </section>
    </div>
  );
}
