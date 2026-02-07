import { configureStore, createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

type SessionStatus = "idle" | "loading" | "connected" | "error";

type ConnectionState = {
  status: SessionStatus;
  username: string;
  roomId: string;
  error: string | null;
};

type JoinGamePayload = {
  roomId: string;
  username: string;
};

type CreateGamePayload = {
  username: string;
};

type RoomResponse = {
  roomId: string;
  username: string;
};

const initialState: ConnectionState = {
  status: "idle",
  username: "",
  roomId: "",
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

export const joinGame = createAsyncThunk<RoomResponse, JoinGamePayload, { rejectValue: string }>(
  "connection/joinGame",
  async ({ roomId, username }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, username })
      });
      return await parseApiResponse<RoomResponse>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to join game";
      return rejectWithValue(message);
    }
  }
);

export const createGame = createAsyncThunk<RoomResponse, CreateGamePayload, { rejectValue: string }>(
  "connection/createGame",
  async ({ username }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      return await parseApiResponse<RoomResponse>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create game";
      return rejectWithValue(message);
    }
  }
);

const connectionSlice = createSlice({
  name: "connection",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
      if (state.status === "error") {
        state.status = "idle";
      }
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.status = "error";
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(joinGame.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(joinGame.fulfilled, (state, action) => {
        state.status = "connected";
        state.roomId = action.payload.roomId;
        state.username = action.payload.username;
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
        state.roomId = action.payload.roomId;
        state.username = action.payload.username;
      })
      .addCase(createGame.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload || "Unable to create game";
      });
  }
});

export const { clearError, setError } = connectionSlice.actions;

export const store = configureStore({
  reducer: {
    connection: connectionSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
