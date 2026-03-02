import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { chooseWord, clearCanvas, leaveLobby, sendGuess, sendStroke, undoStroke, type StrokePoint } from "../store";
import { useRoomSocket } from "../useRoomSocket";
import pencilIcon from "../assets/tools/pencil2.png";
import eraserIcon from "../assets/tools/eraser2.png";
import paintBucketIcon from "../assets/tools/paint_bucket2.png";
import undoIcon from "../assets/tools/undo2.png";
import trashBinIcon from "../assets/tools/trash_bin.png";

const SESSION_KEY = "scribble_squad_tab_session";
const ROOM_NOT_FOUND_ERROR = "Room not found.";
const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 620;
const ROUND_DURATION_SECONDS = 90;
const CHOOSE_WORD_DURATION_SECONDS = 20;
const CANVAS_BACKGROUND = "#ececec";
const DRAW_COLORS = [
  "#FFFFFF", "#9CA3AF", "#FFF000", "#FFB000", "#FF1500", "#D59549", "#F0B6CF", "#E90CF0", "#1717E0", "#17E5E5", "#00FF00",
  "#D9D9D9", "#000000", "#F2CC0C", "#EE7A16", "#B50000", "#AF5B16", "#DC6EA7", "#9707A2", "#22228F", "#2999F0", "#008F00"
];
const THICKNESS_OPTIONS = [3, 6, 10, 14, 18];
const CHAT_TEXT_COLORS = [
  "#2563eb", "#8b5cf6", "#ef4444", "#16a34a", "#0d9488", "#ea580c", "#db2777", "#4f46e5", "#1d4ed8", "#be123c"
];

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

function hashName(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getChatColorForName(name: string) {
  const index = hashName(name.toLowerCase()) % CHAT_TEXT_COLORS.length;
  return CHAT_TEXT_COLORS[index];
}

function formatTimerLabel(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${minutesPart}:${String(secondsPart).padStart(2, "0")}`;
}

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getTimerProgressColor(progressRatio: number) {
  const clamped = clampRatio(progressRatio);
  const hue = Math.round(clamped * 120);
  return `hsl(${hue} 78% 44%)`;
}

function renderSystemMessageText(messageText: string) {
  const correctGuessMatch = messageText.match(/^(.*guessed correctly!\s)(\+\d+\s+points\.)$/i);
  if (correctGuessMatch) {
    return (
      <>
        {correctGuessMatch[1]}
        <span className="font-black text-green-700">{correctGuessMatch[2]}</span>
      </>
    );
  }

  const everyoneGuessedMatch = messageText.match(/^Round over! Everyone guessed the word (.+)\.$/i);
  if (everyoneGuessedMatch) {
    return (
      <>
        Round over! Everyone guessed the word <span className="font-black">{everyoneGuessedMatch[1]}</span>.
      </>
    );
  }

  const timeUpMatch = messageText.match(/^Time is up! The word was (.+)\.$/i);
  if (timeUpMatch) {
    return (
      <>
        Time is up! The word was <span className="font-black">{timeUpMatch[1]}</span>.
      </>
    );
  }

  return messageText;
}

export default function Room({ routeRoomId }: RoomProps) {
  const dispatch = useAppDispatch();
  const {
    roomId,
    username,
    players,
    host,
    drawer,
    phase,
    wordDisplay,
    wordChoices,
    canDraw,
    guessedPlayers,
    messages,
    strokes,
    chooseEndsAt,
    roundEndsAt,
    roundNumber,
    totalRounds,
    roundsCompleted,
    error
  } = useAppSelector((state) => state.connection);

  const displayRoomId = roomId || routeRoomId || "";
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(6);
  const [activeTool, setActiveTool] = useState<DrawTool>("brush");
  const [activeAction, setActiveAction] = useState<"undo" | "delete" | null>(null);
  const [isChoosingWordSubmitting, setIsChoosingWordSubmitting] = useState(false);
  const [guessText, setGuessText] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [liveStrokePoints, setLiveStrokePoints] = useState<StrokePoint[]>([]);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [showGameOverTransition, setShowGameOverTransition] = useState(false);

  const drawingPointsRef = useRef<StrokePoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  const activeStrokeColor = activeTool === "eraser" ? CANVAS_BACKGROUND : brushColor;
  const drawerCursor = useMemo(() => createCursorDot(brushColor, brushSize), [brushColor, brushSize]);
  const isDrawer = Boolean(drawer) && drawer.toLowerCase() === username.toLowerCase();
  const drawerDisplayName = drawer || "Drawer";
  const isChoosingWordPhase = phase === "choosing_word";
  const isDrawerChoosingWord = isChoosingWordPhase && isDrawer;
  const isWaitingForDrawerWord = isChoosingWordPhase && !isDrawer;
  const isGameOver = phase === "game_over";
  const guessedPlayerSet = useMemo(
    () => new Set(guessedPlayers.map((playerName) => playerName.toLowerCase())),
    [guessedPlayers]
  );
  const hasGuessedCurrentRound = guessedPlayerSet.has(username.toLowerCase());
  const canSubmitGuess = phase === "playing" && !canDraw && !hasGuessedCurrentRound;
  const chooseSecondsLeft = phase === "choosing_word" && chooseEndsAt > 0
    ? Math.max(0, Math.ceil((chooseEndsAt - nowTs) / 1000))
    : 0;
  const timerSecondsLeft = phase === "playing" && roundEndsAt > 0
    ? Math.max(0, Math.ceil((roundEndsAt - nowTs) / 1000))
    : 0;
  const displayedTotalRounds = Math.max(totalRounds, roundsCompleted, 1);
  const rankedPlayers = useMemo(
    () => [...players].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)),
    [players]
  );
  const navWordValue = useMemo(() => {
    if (isDrawerChoosingWord) {
      return "Picking...";
    }
    if (isWaitingForDrawerWord) {
      return "______";
    }
    if (!wordDisplay) {
      return "______";
    }
    return wordDisplay;
  }, [isDrawerChoosingWord, isWaitingForDrawerWord, wordDisplay]);
  const maskedLetterCount = useMemo(() => {
    if (canDraw || phase !== "playing") {
      return 0;
    }
    return (wordDisplay.match(/_/g) || []).length;
  }, [canDraw, phase, wordDisplay]);
  const shouldTrackMaskedWord = !canDraw && /_/.test(navWordValue);
  const navRoundLabel = `Round ${Math.max(1, roundNumber)} of ${displayedTotalRounds}`;
  const navTimerSeconds = phase === "playing"
    ? timerSecondsLeft
    : phase === "choosing_word"
      ? chooseSecondsLeft
      : 0;
  const navTimerLabel = `${phase === "choosing_word" ? "Pick" : "Time"} ${formatTimerLabel(navTimerSeconds)}`;
  const navProgressRatio = useMemo(() => {
    if (phase === "playing") {
      return clampRatio(timerSecondsLeft / ROUND_DURATION_SECONDS);
    }
    if (phase === "choosing_word") {
      return clampRatio(chooseSecondsLeft / CHOOSE_WORD_DURATION_SECONDS);
    }
    return 0;
  }, [chooseSecondsLeft, phase, timerSecondsLeft]);
  const navProgressWidth = `${Math.round(navProgressRatio * 100)}%`;
  const navProgressColor = getTimerProgressColor(navProgressRatio);
  const waitingOverlayText = `${drawerDisplayName} is thinking real hard ${chooseSecondsLeft} seconds to pick`;

  useRoomSocket({ roomId: displayRoomId, username });

  useEffect(() => {
    const chatElement = chatListRef.current;
    if (!chatElement) {
      return;
    }
    chatElement.scrollTop = chatElement.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

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
    if (!isChoosingWordPhase) {
      setIsChoosingWordSubmitting(false);
    }
  }, [isChoosingWordPhase]);

  useEffect(() => {
    setNowTs(Date.now());
    if (phase !== "playing" && phase !== "choosing_word") {
      return;
    }

    const timerId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [chooseEndsAt, phase, roundEndsAt]);

  useEffect(() => {
    if (!isGameOver) {
      setShowGameOverTransition(false);
      return;
    }

    setShowGameOverTransition(true);
    const timerId = window.setTimeout(() => {
      setShowGameOverTransition(false);
    }, 1300);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isGameOver]);

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
    if (!canSubmitGuess) {
      return;
    }

    const trimmedGuess = guessText.trim();
    if (!trimmedGuess || !displayRoomId || !username) {
      return;
    }

    setGuessText("");
    void dispatch(sendGuess({ roomId: displayRoomId, username, text: trimmedGuess }));
  }

  function handleChooseWord(selectedWord: string) {
    if (!isDrawerChoosingWord || !displayRoomId || !username || isChoosingWordSubmitting) {
      return;
    }

    setIsChoosingWordSubmitting(true);
    void dispatch(chooseWord({ roomId: displayRoomId, username, word: selectedWord }))
      .finally(() => setIsChoosingWordSubmitting(false));
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

  if (isGameOver) {
    if (showGameOverTransition) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-700 px-4">
          <h1 className="font-['Bebas_Neue'] text-7xl tracking-widest text-zinc-100">Game Over</h1>
        </div>
      );
    }

    const firstPlace = rankedPlayers[0] || null;
    const secondPlace = rankedPlayers[1] || null;
    const thirdPlace = rankedPlayers[2] || null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7] px-4 py-6 sm:px-8 sm:py-8">
        <main className="mx-auto mt-8 w-full max-w-5xl">
          <h1 className="text-center font-['Bebas_Neue'] text-7xl tracking-wider text-white">Game Over</h1>
          <p className="mt-2 text-center text-2xl font-semibold text-white/95">Final Standings</p>

          <section className="mx-auto mt-8 grid max-w-4xl items-end gap-4 sm:grid-cols-3">
            <div className="order-1 sm:order-1">
              {secondPlace ? (
                <div className="rounded-lg border-2 border-zinc-400 bg-zinc-100/95 p-5 text-center shadow-[0_18px_34px_rgba(0,0,0,0.25)]">
                  <p className="font-['Bebas_Neue'] text-6xl leading-none text-zinc-600">2nd</p>
                  <p className="mt-2 text-3xl font-black" style={{ color: getChatColorForName(secondPlace.name) }}>
                    {secondPlace.name}
                  </p>
                  <p className="text-xl font-semibold text-zinc-700">{secondPlace.score} pts</p>
                </div>
              ) : (
                <div />
              )}
            </div>

            <div className="order-2 sm:order-2">
              {firstPlace ? (
                <div className="rounded-lg border-2 border-amber-300 bg-zinc-100/95 p-5 text-center shadow-[0_18px_34px_rgba(0,0,0,0.25)]">
                  <p className="font-['Bebas_Neue'] text-6xl leading-none text-amber-500">1st</p>
                  <p className="mt-2 text-4xl font-black" style={{ color: getChatColorForName(firstPlace.name) }}>
                    {firstPlace.name}
                  </p>
                  <p className="text-2xl font-semibold text-zinc-700">{firstPlace.score} pts</p>
                </div>
              ) : (
                <div />
              )}
            </div>

            <div className="order-3 sm:order-3">
              {thirdPlace ? (
                <div className="rounded-lg border-2 border-[#cd7f32] bg-zinc-100/95 p-5 text-center shadow-[0_18px_34px_rgba(0,0,0,0.25)]">
                  <p className="font-['Bebas_Neue'] text-6xl leading-none text-[#cd7f32]">3rd</p>
                  <p className="mt-2 text-3xl font-black" style={{ color: getChatColorForName(thirdPlace.name) }}>
                    {thirdPlace.name}
                  </p>
                  <p className="text-xl font-semibold text-zinc-700">{thirdPlace.score} pts</p>
                </div>
              ) : (
                <div />
              )}
            </div>
          </section>

          <section className="mx-auto mt-6 w-full max-w-3xl rounded-lg bg-zinc-100/95 p-4 shadow-[0_12px_25px_rgba(0,0,0,0.15)]">
            <h2 className="text-center font-['Bebas_Neue'] text-4xl tracking-wide text-[#1982b5]">All Players</h2>
            <ul className="mt-3 space-y-2">
              {rankedPlayers.map((player, index) => (
                <li key={player.name} className="flex items-center justify-between rounded border border-zinc-300 bg-zinc-50 px-3 py-2">
                  <p
                    className="text-xl font-bold"
                    style={{ color: getChatColorForName(player.name) }}
                  >
                    {index + 1}. {player.name}
                  </p>
                  <p className="text-lg font-semibold text-zinc-700">{player.score} pts</p>
                </li>
              ))}
            </ul>
          </section>

          <button
            type="button"
            className="mx-auto mt-6 block w-full max-w-3xl bg-[#ff5a4a] px-4 py-4 text-center font-['Bebas_Neue'] text-5xl leading-none tracking-wide text-white transition duration-150 hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-[#ff4c3a] hover:ring-2 hover:ring-sky-400"
            onClick={handleGoHome}
          >
            Play Again
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen xl:h-[100dvh] xl:overflow-hidden bg-gradient-to-br from-[#1fb2f0] via-[#10a4e4] to-[#108ed7] px-4 pb-4 pt-4 sm:px-7 sm:pb-6 sm:pt-4 flex flex-col">
      <header className="w-full">
        <div className="mx-auto w-full max-w-[1500px] rounded-lg bg-zinc-100/95 px-4 py-3 shadow-[0_12px_25px_rgba(0,0,0,0.15)] sm:px-5">
          <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 min-w-[74px] items-center justify-center rounded-md bg-[#ff5a4a] px-4 text-sm font-bold tracking-wide text-white transition hover:-translate-y-0.5 hover:bg-[#ff4c3a] hover:ring-2 hover:ring-sky-300"
                onClick={handleGoHome}
              >
                Home
              </button>
              <p className="text-base font-semibold text-zinc-800 sm:text-lg">
                {navRoundLabel}
              </p>
            </div>
            <p className="text-center text-2xl font-black text-zinc-900 sm:text-3xl">
              Word:{" "}
              <span className="inline-flex items-start whitespace-pre text-zinc-900">
                <span className={shouldTrackMaskedWord ? "tracking-[0.14em]" : ""}>{navWordValue}</span>
                {!canDraw && phase === "playing" && maskedLetterCount > 0 && (
                  <sup className="-mt-1 ml-1 text-xs font-semibold text-zinc-500">{maskedLetterCount}</sup>
                )}
              </span>
            </p>
            <div className="justify-self-stretch md:justify-self-end md:w-[240px]">
              <p className="text-right text-sm font-semibold text-zinc-700">{navTimerLabel}</p>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-zinc-300/90">
                <div
                  className="h-full rounded-full transition-[width,background-color] duration-300"
                  style={{
                    width: navProgressWidth,
                    backgroundColor: navProgressColor
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-4 grid w-full flex-1 min-h-0 max-w-[1500px] items-stretch gap-5 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-zinc-100/95 p-4 shadow-[0_12px_25px_rgba(0,0,0,0.15)]">
          <h2 className="text-center font-['Bebas_Neue'] text-5xl tracking-wider text-[#1982b5]">Scores</h2>
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {players.map((player) => {
              const isPlayerHost = player.name.toLowerCase() === host.toLowerCase();
              const isPlayerDrawer = drawer ? player.name.toLowerCase() === drawer.toLowerCase() : false;
              const isYou = player.name.toLowerCase() === username.toLowerCase();
              const isPlayerGuessed = guessedPlayerSet.has(player.name.toLowerCase());

              return (
                <li key={player.name} className="rounded border border-zinc-300 bg-zinc-50 px-3 py-3 shadow-sm">
                  <div className="relative flex flex-col items-center justify-center px-8 text-center">
                    <div>
                      <p
                        className="text-xl font-bold"
                        style={{ color: getChatColorForName(player.name) }}
                      >
                        {player.name}
                        {isYou ? " (you)" : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
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
                    </div>
                    {phase === "playing" && isPlayerGuessed && !isPlayerDrawer && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-2xl font-black text-green-600">✓</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex min-h-0 flex-col overflow-y-auto">
          <div className="flex justify-center">
            <div className="relative w-full max-w-[760px]">
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className={`w-full max-w-[760px] rounded-md border-2 border-white/40 bg-[#ececec] shadow-[0_18px_30px_rgba(0,0,0,0.2)] touch-none ${
                  isWaitingForDrawerWord ? "opacity-60 saturate-0" : ""
                }`}
                style={canDraw ? { cursor: drawerCursor } : undefined}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerLeave={finishStroke}
                onPointerCancel={finishStroke}
              />
              {isWaitingForDrawerWord && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-zinc-900/20 px-6 text-center">
                  <p className="font-['Bebas_Neue'] text-5xl tracking-wide text-white">
                    {waitingOverlayText}
                  </p>
                </div>
              )}
            </div>
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
                        className={`h-[18px] w-[18px] cursor-pointer rounded-[4px] border transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
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
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeTool === "brush"
                          ? "bg-[#ff5a4a] text-white ring-2 ring-sky-400"
                          : "bg-[#ff5a4a] text-white"
                      }`}
                      onClick={() => setActiveTool("brush")}
                    >
                      <img src={pencilIcon} alt="Brush tool" className="h-5 w-5 object-contain" draggable={false} />
                    </button>
                    <button
                      type="button"
                      title="Eraser"
                      aria-label="Eraser"
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeTool === "eraser"
                          ? "bg-[#ff5a4a] text-white ring-2 ring-sky-400"
                          : "bg-[#ff5a4a] text-white"
                      }`}
                      onClick={() => setActiveTool("eraser")}
                    >
                      <img src={eraserIcon} alt="Eraser tool" className="h-5 w-5 object-contain" draggable={false} />
                    </button>
                    <button
                      type="button"
                      title="Bucket"
                      aria-label="Bucket"
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeTool === "bucket"
                          ? "bg-[#ff5a4a] text-white ring-2 ring-sky-400"
                          : "bg-[#ff5a4a] text-white"
                      }`}
                      onClick={() => setActiveTool("bucket")}
                    >
                      <img src={paintBucketIcon} alt="Bucket tool" className="h-5 w-5 object-contain" draggable={false} />
                    </button>
                    <button
                      type="button"
                      title="Undo"
                      aria-label="Undo"
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-white transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeAction === "undo" ? "bg-sky-500" : "bg-[#ff5a4a]"
                      }`}
                      onClick={handleUndo}
                    >
                      <img src={undoIcon} alt="Undo action" className="h-5 w-5 object-contain" draggable={false} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label="Delete"
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-white transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
                        activeAction === "delete" ? "bg-sky-500" : "bg-[#ff5a4a]"
                      }`}
                      onClick={handleClearCanvas}
                    >
                      <img src={trashBinIcon} alt="Delete action" className="h-5 w-5 object-contain" draggable={false} />
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
                        className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md bg-[#ff5a4a] transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
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
            !isWaitingForDrawerWord && !isDrawerChoosingWord && (
              <p className="mt-4 text-center text-sm font-semibold text-white/90">
                Guess the word in chat.
              </p>
            )
          )}
        </section>

        <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-zinc-100/95 p-4 shadow-[0_12px_25px_rgba(0,0,0,0.15)] ${
          isWaitingForDrawerWord ? "opacity-75" : ""
        }`}>
          <h2 className="text-center font-['Bebas_Neue'] text-5xl tracking-wider text-[#1982b5]">Chat</h2>
          <div
            ref={chatListRef}
            className={`mt-3 min-h-0 flex-1 overflow-y-auto rounded border border-zinc-300 bg-zinc-50 p-2 ${
              isWaitingForDrawerWord ? "grayscale-[0.2]" : ""
            }`}
          >
            {messages.map((message) => {
              const isGuessMessage = message.type === "guess";
              const isSuccessMessage = message.type === "success";
              const guessColor = getChatColorForName(message.username);

              return (
                <article key={message.id} className="mb-2 w-full rounded bg-zinc-100 px-3 py-2 shadow-sm last:mb-0">
                  <p
                    className="text-sm font-bold"
                    style={isGuessMessage ? { color: guessColor } : undefined}
                  >
                    {message.username}
                  </p>
                  <p
                    className={`text-base ${
                      isSuccessMessage
                        ? "font-semibold text-green-700"
                        : message.type === "system"
                          ? "font-semibold text-zinc-700"
                          : "font-semibold"
                    }`}
                    style={isGuessMessage ? { color: guessColor } : undefined}
                  >
                    {message.type === "system" ? renderSystemMessageText(message.text) : message.text}
                  </p>
                </article>
              );
            })}
          </div>

          <form className="mt-3 flex items-center gap-2" onSubmit={handleGuessSubmit}>
            <input
              className="flex-1 border border-zinc-400 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 disabled:bg-zinc-200"
              placeholder={
                canDraw
                  ? "Drawer cannot chat"
                  : hasGuessedCurrentRound
                    ? "You already guessed correctly."
                  : isWaitingForDrawerWord
                    ? "Drawer is picking a word..."
                    : "Type your guess..."
              }
              value={guessText}
              onChange={(event) => setGuessText(event.target.value)}
              disabled={!canSubmitGuess}
            />
            <button
              type="submit"
              className="rounded bg-zinc-300 px-3 py-2 text-xl font-black text-zinc-700 transition enabled:hover:bg-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSubmitGuess}
            >
              ➤
            </button>
          </form>

          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        </section>
      </main>

      {isDrawerChoosingWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
          <div className="w-full max-w-md rounded-lg bg-zinc-100 p-6 text-center shadow-[0_24px_45px_rgba(0,0,0,0.35)]">
            <p className="text-xl font-semibold text-zinc-900">You are the drawer. Pick one word to draw:</p>
            <p className="mt-1 text-lg font-bold text-zinc-700">{chooseSecondsLeft} seconds left</p>
            <div className="mt-5 space-y-3">
              {wordChoices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="w-full rounded-md border border-white/25 bg-[#ff5a4a] px-4 py-3 text-center font-['Bebas_Neue'] text-4xl leading-none tracking-wide text-white transition duration-150 enabled:hover:-translate-y-0.5 enabled:hover:scale-[1.01] enabled:hover:bg-[#ff4c3a] enabled:hover:ring-2 enabled:hover:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={() => handleChooseWord(choice)}
                  disabled={isChoosingWordSubmitting}
                >
                  {choice.toUpperCase()}
                </button>
              ))}
              {wordChoices.length === 0 && (
                <p className="text-base font-semibold text-zinc-700">Preparing word choices...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
