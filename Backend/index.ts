import express from "express";
import 'dotenv/config';

import * as pins from './routes/pins.ts';
import * as auth from './routes/auth.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/heartbeat", (req, res) => {
  console.log("[Server-side] Server received conn");
  res.json({
    status: "ok",
    timestamp: Date.now(),
  });
});

app.post("/api/login", auth.login);
app.get("/api/pins", pins.getAllPins);
app.get("/api/pins/:id", pins.getPin);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});


