import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { clearCanvas, fetchRoom, leaveLobby, sendGuess, sendStroke, type StrokePoint } from "../store";

const ROOM_REFRESH_MS = 900;
const SESSION_KEY = "scribble_squad_tab_session";
const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 520;

type RoomProps = {
  routeRoomId?: string;
};

type DrawStroke = {
  color: string;
  size: number;
  points: StrokePoint[];
};

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke) {
  if (stroke.points.length < 2) {
    return;
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let index = 1; index < stroke.points.length; index += 1) {
    ctx.lineTo(stroke.points[index].x, stroke.points[index].y);
  }
  ctx.stroke();
}

export default function Room({ routeRoomId }: RoomProps) {
  const dispatch = useAppDispatch();
  const {
    roomId,
    username,
    players,
    host,
    drawer,
    wordDisplay,
    canDraw,
    messages,
    strokes,
    error
  } = useAppSelector((state) => state.connection);

  const displayRoomId = roomId || routeRoomId || "";
  const [brushColor, setBrushColor] = useState("#f55a42");
  const [brushSize, setBrushSize] = useState(5);
  const [guessText, setGuessText] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [liveStrokePoints, setLiveStrokePoints] = useState<StrokePoint[]>([]);

  const drawingPointsRef = useRef<StrokePoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  const formattedWord = useMemo(() => {
    if (!wordDisplay) {
      return "";
    }
    return canDraw ? wordDisplay.toUpperCase() : wordDisplay.split("").join(" ");
  }, [canDraw, wordDisplay]);

  useEffect(() => {
    if (!displayRoomId || !username) {
      return;
    }

    void dispatch(fetchRoom({ roomId: displayRoomId, username }));
    const timerId = window.setInterval(() => {
      void dispatch(fetchRoom({ roomId: displayRoomId, username }));
    }, ROOM_REFRESH_MS);

    return () => window.clearInterval(timerId);
  }, [dispatch, displayRoomId, username]);

  useEffect(() => {
    const chatElement = chatListRef.current;
    if (!chatElement) {
      return;
    }
    chatElement.scrollTop = chatElement.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#ececec";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    strokes.forEach((stroke) => drawStroke(context, stroke));

    if (liveStrokePoints.length > 1) {
      drawStroke(context, {
        color: brushColor,
        size: brushSize,
        points: liveStrokePoints
      });
    }
  }, [brushColor, brushSize, liveStrokePoints, strokes]);

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): StrokePoint {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, x)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, y))
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canDraw) {
      return;
    }

    const point = getCanvasPoint(event);
    const startingPoints = [point];
    drawingPointsRef.current = startingPoints;
    setLiveStrokePoints(startingPoints);
    setIsDrawing(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canDraw || !isDrawing) {
      return;
    }

    const point = getCanvasPoint(event);
    const nextPoints = [...drawingPointsRef.current, point];
    drawingPointsRef.current = nextPoints;
    setLiveStrokePoints(nextPoints);
  }

  function finishStroke() {
    if (!canDraw || !isDrawing) {
      return;
    }

    setIsDrawing(false);
    const points = drawingPointsRef.current;
    drawingPointsRef.current = [];
    setLiveStrokePoints([]);

    if (points.length < 2) {
      return;
    }

    void dispatch(
      sendStroke({
        roomId: displayRoomId,
        username,
        stroke: {
          color: brushColor,
          size: brushSize,
          points
        }
      })
    );
  }

  function handleGuessSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canDraw) {
      return;
    }

    const trimmedGuess = guessText.trim();
    if (!trimmedGuess || !displayRoomId || !username) {
      return;
    }

    setGuessText("");
    void dispatch(sendGuess({ roomId: displayRoomId, username, text: trimmedGuess }));
  }

  function handleClearCanvas() {
    if (!canDraw) {
      return;
    }
    void dispatch(clearCanvas({ roomId: displayRoomId, username }));
    void dispatch(fetchRoom({ roomId: displayRoomId, username }));
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7] px-4 py-4 sm:px-7 sm:py-6">
      <button
        type="button"
        className="rounded-md bg-white/20 px-4 py-2 text-sm font-bold tracking-wide text-white transition hover:bg-white/30"
        onClick={handleGoHome}
      >
        Home
      </button>

      <main className="mx-auto mt-4 grid w-full max-w-[1500px] gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <section className="rounded-lg bg-zinc-100/95 p-4 shadow-[0_12px_25px_rgba(0,0,0,0.15)]">
          <h2 className="text-center font-['Bebas_Neue'] text-5xl tracking-wider text-[#1982b5]">Scores</h2>
          <ul className="mt-3 space-y-2">
            {players.map((player) => {
              const isPlayerHost = player.name.toLowerCase() === host.toLowerCase();
              const isPlayerDrawer = drawer ? player.name.toLowerCase() === drawer.toLowerCase() : false;
              const isYou = player.name.toLowerCase() === username.toLowerCase();

              return (
                <li key={player.name} className="rounded border border-zinc-300 bg-zinc-50 px-3 py-3 shadow-sm">
                  <p className="text-xl font-bold text-zinc-800">
                    {player.name}
                    {isYou ? " (you)" : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-zinc-700">{player.score} pts</span>
                    {isPlayerHost && (
                      <span className="rounded bg-orange-500 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                        Host
                      </span>
                    )}
                    {isPlayerDrawer && (
                      <span className="rounded bg-sky-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                        Drawing
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col">
          <h2 className="text-center font-['Bebas_Neue'] text-6xl tracking-wider text-white">
            {canDraw ? `Your Word: ${formattedWord}` : `Word: ${formattedWord}`}
          </h2>
          <div className="mt-3 flex justify-center">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="w-full max-w-[760px] rounded-md border-2 border-white/40 bg-[#ececec] shadow-[0_18px_30px_rgba(0,0,0,0.2)] touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerLeave={finishStroke}
            />
          </div>

          {canDraw ? (
            <div className="mx-auto mt-4 flex w-full max-w-[760px] flex-wrap items-center gap-4 rounded bg-white/20 px-4 py-3 text-white">
              <label className="flex items-center gap-2 text-sm font-semibold">
                Color
                <input
                  type="color"
                  value={brushColor}
                  onChange={(event) => setBrushColor(event.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-white/40 bg-transparent"
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold">
                Size
                <input
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                />
                <span>{brushSize}px</span>
              </label>

              <button
                type="button"
                className="rounded bg-[#ff5a4a] px-3 py-1 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-[#ff4a3a]"
                onClick={handleClearCanvas}
              >
                Clear Canvas
              </button>
            </div>
          ) : (
            <p className="mt-4 text-center text-sm font-semibold text-white/90">
              Guess the word in chat. Drawer cannot type.
            </p>
          )}
        </section>

        <section className="rounded-lg bg-zinc-100/95 p-4 shadow-[0_12px_25px_rgba(0,0,0,0.15)]">
          <h2 className="text-center font-['Bebas_Neue'] text-5xl tracking-wider text-[#1982b5]">Chat</h2>
          <div ref={chatListRef} className="mt-3 h-[520px] overflow-y-auto rounded border border-zinc-300 bg-zinc-50 p-2">
            {messages.map((message) => (
              <article key={message.id} className="mb-2 rounded bg-zinc-100 px-3 py-2 shadow-sm">
                <p className="text-sm font-bold text-zinc-800">{message.username}</p>
                <p className={`text-base ${message.type === "system" ? "font-semibold text-zinc-700" : "text-zinc-900"}`}>
                  {message.text}
                </p>
              </article>
            ))}
          </div>

          <form className="mt-3 flex items-center gap-2" onSubmit={handleGuessSubmit}>
            <input
              className="flex-1 border border-zinc-400 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 disabled:bg-zinc-200"
              placeholder={canDraw ? "Drawer cannot chat" : "Type your guess..."}
              value={guessText}
              onChange={(event) => setGuessText(event.target.value)}
              disabled={canDraw}
            />
            <button
              type="submit"
              className="rounded bg-zinc-300 px-3 py-2 text-xl font-black text-zinc-700 transition enabled:hover:bg-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={canDraw}
            >
              ➤
            </button>
          </form>

          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        </section>
      </main>
    </div>
  );
}
