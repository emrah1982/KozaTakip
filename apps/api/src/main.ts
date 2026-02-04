import cors from "cors";
import express from "express";
import { createRouter } from "./presentation/http/router.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use(createRouter());

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, "0.0.0.0", () => {
  process.stdout.write(`API listening on http://localhost:${port}\n`);
});
