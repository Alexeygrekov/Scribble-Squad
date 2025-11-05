import { configureStore, createSlice } from "@reduxjs/toolkit";

const connectionSlice = createSlice({
  name: "connection",
  initialState: { status: "disconnected" as "disconnected" | "connected" },
  reducers: {
    setConnected: (state) => { state.status = "connected"; },
    setDisconnected: (state) => { state.status = "disconnected"; }
  }
});

export const { setConnected, setDisconnected } = connectionSlice.actions;

export const store = configureStore({
  reducer: {
    connection: connectionSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
