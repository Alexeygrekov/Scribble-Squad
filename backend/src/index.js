import express from "express";
import cors from "cors";
import morgan from "morgan";
import "dotenv/config";
import healthRouter from "./routes/health.js";
import roomsRouter from "./routes/rooms.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: ORIGIN }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/health", healthRouter);
app.use("/api/rooms", roomsRouter);

app.use(errorHandler);

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
