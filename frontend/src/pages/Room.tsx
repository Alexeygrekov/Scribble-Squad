import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { clearCanvas, leaveLobby, sendGuess, sendStroke, undoStroke, type StrokePoint } from "../store";
import { useRoomSocket } from "../useRoomSocket";

const SESSION_KEY = "scribble_squad_tab_session";
const ROOM_NOT_FOUND_ERROR = "Room not found.";
const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 520;
const CANVAS_BACKGROUND = "#ececec";
const DRAW_COLORS = [
  "#ffffff", "#c8ced8", "#4f5d75", "#f8e71c", "#ffb703", "#f94144", "#d59649", "#f6bdcf", "#f023e1", "#1717e0", "#17e5e5",
  "#00e700", "#cfd2d8", "#000000", "#f2cc0c", "#ee7a16", "#b50000", "#af5b16", "#dc6ea7", "#9707a2", "#22228f", "#2999f0"
];
const THICKNESS_OPTIONS = [3, 6, 10, 14, 18];

type RoomProps = {
  routeRoomId?: string;
};

type DrawTool = "brush" | "eraser" | "bucket";

type DrawStroke = {
  mode: "stroke" | "fill";
  color: string;
  size: number;
  points: StrokePoint[];
};

type IconProps = {
  className?: string;
};

function BrushIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M13.5 4.5 19.5 10.5 8 22H2v-6z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m12 6 6 6" strokeLinecap="round" />
    </svg>
  );
}

function EraserIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="m4 15 7-9a2 2 0 0 1 3 0l6 7a2 2 0 0 1-.2 2.8l-1.5 1.3a2 2 0 0 1-1.3.5H9.5a2 2 0 0 1-1.5-.7L4 15Z" strokeLinejoin="round" />
      <path d="M8.8 17.8h10.4" strokeLinecap="round" />
    </svg>
  );
}

function BucketIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="m6 9 6-6 6 6-6 6-6-6Z" strokeLinejoin="round" />
      <path d="M12 15v4" strokeLinecap="round" />
      <path d="M17 17a2 2 0 0 1 4 0c0 1.2-.9 2.2-2 2.2s-2-1-2-2.2Z" strokeLinejoin="round" />
    </svg>
  );
}

function UndoIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M9 7H4v5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12a8 8 0 1 0 2.5-5.8L4 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 6h16" strokeLinecap="round" />
      <path d="M8 6V4h8v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m6 6 1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function createCursorDot(color: string, size: number) {
  const cursorSize = Math.max(14, Math.min(28, size + 10));
  const center = Math.floor(cursorSize / 2);
  const radius = Math.max(3, Math.floor(size / 2) + 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cursorSize}" height="${cursorSize}" viewBox="0 0 ${cursorSize} ${cursorSize}"><circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" stroke="#1f2937" stroke-width="1.25"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke) {
  if (stroke.mode === "fill") {
    ctx.fillStyle = stroke.color;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  }

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
  const [brushColor, setBrushColor] = useState("#f94144");
  const [brushSize, setBrushSize] = useState(6);
  const [activeTool, setActiveTool] = useState<DrawTool>("brush");
  const [activeAction, setActiveAction] = useState<"undo" | "delete" | null>(null);
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
  const activeStrokeColor = activeTool === "eraser" ? CANVAS_BACKGROUND : brushColor;
  const drawerCursor = useMemo(() => createCursorDot(brushColor, brushSize), [brushColor, brushSize]);

  useRoomSocket({ roomId: displayRoomId, username });

  useEffect(() => {
    const chatElement = chatListRef.current;
    if (!chatElement) {
      return;
    }
    chatElement.scrollTop = chatElement.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (error !== ROOM_NOT_FOUND_ERROR) {
      return;
    }
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      // ignore storage write failures
    }
    dispatch(leaveLobby());
  }, [dispatch, error]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = CANVAS_BACKGROUND;
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    strokes.forEach((stroke) => drawStroke(context, stroke));

    if (liveStrokePoints.length > 1 && activeTool !== "bucket") {
      drawStroke(context, {
        mode: "stroke",
        color: activeStrokeColor,
        size: brushSize,
        points: liveStrokePoints
      });
    }
  }, [activeStrokeColor, activeTool, brushSize, liveStrokePoints, strokes]);

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

    if (activeTool === "bucket") {
      void dispatch(
        sendStroke({
          roomId: displayRoomId,
          username,
          stroke: {
            mode: "fill",
            color: brushColor,
            size: brushSize,
            points: []
          }
        })
      );
      return;
    }

    const point = getCanvasPoint(event);
    const startingPoints = [point];
    drawingPointsRef.current = startingPoints;
    setLiveStrokePoints(startingPoints);
    setIsDrawing(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canDraw || !isDrawing || activeTool === "bucket") {
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
          mode: "stroke",
          color: activeStrokeColor,
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
    setActiveAction("delete");
    window.setTimeout(() => {
      setActiveAction((current) => (current === "delete" ? null : current));
    }, 220);
    void dispatch(clearCanvas({ roomId: displayRoomId, username }));
  }

  function handleUndo() {
    if (!canDraw) {
      return;
    }
    setActiveAction("undo");
    window.setTimeout(() => {
      setActiveAction((current) => (current === "undo" ? null : current));
    }, 220);
    void dispatch(undoStroke({ roomId: displayRoomId, username }));
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
              style={canDraw ? { cursor: drawerCursor } : undefined}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerLeave={finishStroke}
              onPointerCancel={finishStroke}
            />
          </div>

          {canDraw ? (
            <div className="mx-auto mt-4 w-full max-w-[760px]">
              <div className="grid gap-3 md:grid-cols-[auto_auto_auto] md:items-start md:justify-center">
                <div className="w-[252px] max-w-full rounded-lg border border-white/30 bg-[#1f2b43]/88 px-2.5 py-2">
                  <div className="mx-auto grid w-fit grid-cols-11 gap-0.5">
                    {DRAW_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        className={`h-[18px] w-[18px] rounded-[4px] border transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                          brushColor === color
                            ? "border-white/25 ring-2 ring-sky-400"
                            : "border-white/25"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setBrushColor(color)}
                      />
                    ))}
                  </div>
                </div>

                <div className="w-[252px] max-w-full rounded-lg border border-white/30 bg-[#1f2b43]/88 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      title="Brush"
                      aria-label="Brush"
                      className={`flex h-10 w-10 items-center justify-center rounded-md transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeTool === "brush" ? "bg-sky-500 text-white" : "bg-white/15 text-white"
                      }`}
                      onClick={() => setActiveTool("brush")}
                    >
                      <BrushIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      title="Eraser"
                      aria-label="Eraser"
                      className={`flex h-10 w-10 items-center justify-center rounded-md transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeTool === "eraser" ? "bg-sky-500 text-white" : "bg-white/15 text-white"
                      }`}
                      onClick={() => setActiveTool("eraser")}
                    >
                      <EraserIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      title="Bucket"
                      aria-label="Bucket"
                      className={`flex h-10 w-10 items-center justify-center rounded-md transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeTool === "bucket" ? "bg-sky-500 text-white" : "bg-white/15 text-white"
                      }`}
                      onClick={() => setActiveTool("bucket")}
                    >
                      <BucketIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      title="Undo"
                      aria-label="Undo"
                      className={`flex h-10 w-10 items-center justify-center rounded-md text-white transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeAction === "undo" ? "bg-sky-500" : "bg-white/15"
                      }`}
                      onClick={handleUndo}
                    >
                      <UndoIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label="Delete"
                      className={`flex h-10 w-10 items-center justify-center rounded-md text-white transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeAction === "delete" ? "bg-sky-500" : "bg-white/15"
                      }`}
                      onClick={handleClearCanvas}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="w-[252px] max-w-full rounded-lg border border-white/30 bg-[#1f2b43]/88 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    {THICKNESS_OPTIONS.map((sizeOption) => (
                      <button
                        key={sizeOption}
                        type="button"
                        title={`${sizeOption}px`}
                        className={`flex h-10 w-10 items-center justify-center rounded-md bg-white/15 transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                          brushSize === sizeOption ? "ring-2 ring-sky-400" : ""
                        }`}
                        onClick={() => setBrushSize(sizeOption)}
                      >
                        <span
                          className="rounded-full bg-white"
                          style={{
                            width: Math.max(4, Math.min(18, sizeOption)),
                            height: Math.max(4, Math.min(18, sizeOption))
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
