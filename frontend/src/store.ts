import { configureStore, createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

type SessionStatus = "idle" | "loading" | "connected" | "error";
type GamePhase = "lobby" | "playing";
type MessageType = "guess" | "system";

export type StrokePoint = { x: number; y: number };
export type Stroke = { id: string; mode: "stroke" | "fill"; color: string; size: number; points: StrokePoint[] };
export type ChatMessage = { id: string; type: MessageType; username: string; text: string; ts: number };
export type PlayerScore = { name: string; score: number };

export type RoomSnapshot = {
  roomId: string;
  phase: GamePhase;
  host: string;
  drawer: string | null;
  players: PlayerScore[];
  wordDisplay: string;
  canDraw: boolean;
  guessedPlayers: string[];
  messages: ChatMessage[];
  strokes: Stroke[];
};

type JoinGamePayload = {
  roomId: string;
  username: string;
};

type CreateGamePayload = {
  username: string;
};

type GameActionPayload = {
  roomId: string;
  username: string;
};

type GuessPayload = GameActionPayload & {
  text: string;
};

type SendStrokePayload = GameActionPayload & {
  stroke: {
    mode: "stroke" | "fill";
    color: string;
    size: number;
    points?: StrokePoint[];
  };
};

type JoinOrCreateResponse = RoomSnapshot & {
  username: string;
};

type ConnectionState = {
  status: SessionStatus;
  username: string;
  roomId: string;
  phase: GamePhase;
  host: string;
  drawer: string | null;
  players: PlayerScore[];
  wordDisplay: string;
  canDraw: boolean;
  guessedPlayers: string[];
  messages: ChatMessage[];
  strokes: Stroke[];
  error: string | null;
};

const initialState: ConnectionState = {
  status: "idle",
  username: "",
  roomId: "",
  phase: "lobby",
  host: "",
  drawer: null,
  players: [],
  wordDisplay: "",
  canDraw: false,
  guessedPlayers: [],
  messages: [],
  strokes: [],
  error: null
};

async function parseApiResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorResponse = data as { error?: unknown };
    const message = typeof errorResponse.error === "string" ? errorResponse.error : "Request failed";
    throw new Error(message);
  }
  return data as T;
}

function applySnapshot(state: ConnectionState, snapshot: RoomSnapshot) {
  state.roomId = snapshot.roomId;
  state.phase = snapshot.phase;
  state.host = snapshot.host;
  state.drawer = snapshot.drawer;
  state.players = snapshot.players;
  state.wordDisplay = snapshot.wordDisplay;
  state.canDraw = snapshot.canDraw;
  state.guessedPlayers = snapshot.guessedPlayers;
  state.messages = snapshot.messages;
  state.strokes = snapshot.strokes;
}

export const joinGame = createAsyncThunk<JoinOrCreateResponse, JoinGamePayload, { rejectValue: string }>(
  "connection/joinGame",
  async ({ roomId, username }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, username })
      });
      return await parseApiResponse<JoinOrCreateResponse>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to join game";
      return rejectWithValue(message);
    }
  }
);

export const createGame = createAsyncThunk<JoinOrCreateResponse, CreateGamePayload, { rejectValue: string }>(
  "connection/createGame",
  async ({ username }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      return await parseApiResponse<JoinOrCreateResponse>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create game";
      return rejectWithValue(message);
    }
  }
);

export const fetchRoom = createAsyncThunk<RoomSnapshot, GameActionPayload, { rejectValue: string }>(
  "connection/fetchRoom",
  async ({ roomId, username }, { rejectWithValue }) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}?username=${encodeURIComponent(username)}`
      );
      return await parseApiResponse<RoomSnapshot>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch room";
      return rejectWithValue(message);
    }
  }
);

export const startGame = createAsyncThunk<RoomSnapshot, GameActionPayload, { rejectValue: string }>(
  "connection/startGame",
  async ({ roomId, username }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      return await parseApiResponse<RoomSnapshot>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start game";
      return rejectWithValue(message);
    }
  }
);

export const sendGuess = createAsyncThunk<RoomSnapshot, GuessPayload, { rejectValue: string }>(
  "connection/sendGuess",
  async ({ roomId, username, text }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, text })
      });
      return await parseApiResponse<RoomSnapshot>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send guess";
      return rejectWithValue(message);
    }
  }
);

export const sendStroke = createAsyncThunk<void, SendStrokePayload, { rejectValue: string }>(
  "connection/sendStroke",
  async ({ roomId, username, stroke }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/strokes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, stroke })
      });
      await parseApiResponse<{ ok: boolean }>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send stroke";
      return rejectWithValue(message);
    }
  }
);

export const clearCanvas = createAsyncThunk<void, GameActionPayload, { rejectValue: string }>(
  "connection/clearCanvas",
  async ({ roomId, username }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      await parseApiResponse<{ ok: boolean }>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to clear canvas";
      return rejectWithValue(message);
    }
  }
);

export const undoStroke = createAsyncThunk<void, GameActionPayload, { rejectValue: string }>(
  "connection/undoStroke",
  async ({ roomId, username }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      await parseApiResponse<{ ok: boolean }>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to undo";
      return rejectWithValue(message);
    }
  }
);

const connectionSlice = createSlice({
  name: "connection",
  initialState,
  reducers: {
    applyRoomSnapshot: (state, action: PayloadAction<RoomSnapshot>) => {
      if (state.roomId && state.roomId !== action.payload.roomId) {
        return;
      }
      state.status = "connected";
      applySnapshot(state, action.payload);
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
      if (state.status === "error" && !state.roomId) {
        state.status = "idle";
      }
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      if (!state.roomId) {
        state.status = "error";
      }
    },
    leaveLobby: () => ({ ...initialState })
  },
  extraReducers: (builder) => {
    builder
      .addCase(joinGame.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(joinGame.fulfilled, (state, action) => {
        state.status = "connected";
        state.username = action.payload.username;
        applySnapshot(state, action.payload);
        state.error = null;
      })
      .addCase(joinGame.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload || "Unable to join game";
      })
      .addCase(createGame.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(createGame.fulfilled, (state, action) => {
        state.status = "connected";
        state.username = action.payload.username;
        applySnapshot(state, action.payload);
        state.error = null;
      })
      .addCase(createGame.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload || "Unable to create game";
      })
      .addCase(fetchRoom.fulfilled, (state, action) => {
        if (state.roomId === action.payload.roomId) {
          applySnapshot(state, action.payload);
          state.error = null;
        }
      })
      .addCase(fetchRoom.rejected, (state, action) => {
        state.error = action.payload || "Unable to refresh room";
      })
      .addCase(startGame.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(startGame.fulfilled, (state, action) => {
        state.status = "connected";
        applySnapshot(state, action.payload);
        state.error = null;
      })
      .addCase(startGame.rejected, (state, action) => {
        state.status = "connected";
        state.error = action.payload || "Unable to start game";
      })
      .addCase(sendGuess.fulfilled, (state, action) => {
        applySnapshot(state, action.payload);
        state.error = null;
      })
      .addCase(sendGuess.rejected, (state, action) => {
        state.error = action.payload || "Unable to send guess";
      })
      .addCase(sendStroke.rejected, (state, action) => {
        state.error = action.payload || "Unable to draw";
      })
      .addCase(clearCanvas.rejected, (state, action) => {
        state.error = action.payload || "Unable to clear canvas";
      })
      .addCase(undoStroke.rejected, (state, action) => {
        state.error = action.payload || "Unable to undo";
      });
  }
});

export const { applyRoomSnapshot, clearError, setError, leaveLobby } = connectionSlice.actions;

export const store = configureStore({
  reducer: {
    connection: connectionSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
