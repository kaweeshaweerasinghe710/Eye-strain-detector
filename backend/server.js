const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 4000;
const ML_SERVER = "http://localhost:5000";

// Enable CORS so React (port 3000) can talk to Node
app.use(cors());

// Increase JSON limit to 50mb for base64 image payloads
app.use(express.json({ limit: "50mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "node-backend", port: PORT });
});

// Main analyze endpoint — proxies to Python Flask ML server
app.post("/analyze", async (req, res) => {
  if (!req.body || !req.body.image) {
    return res.status(400).json({ error: "Missing image data in request body" });
  }

  try {
    const response = await axios.post(`${ML_SERVER}/analyze`, req.body, {
      timeout: 5000, // 5 second timeout
      headers: { "Content-Type": "application/json" },
    });

    res.json(response.data);
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      console.error("[Node] Cannot reach Python ML server at", ML_SERVER);
      return res.status(503).json({
        error: "ML server is not running. Start it with: python app.py",
      });
    }

    if (err.code === "ECONNABORTED") {
      console.error("[Node] ML server timed out");
      return res.status(504).json({ error: "ML server timed out" });
    }

    console.error("[Node] Error talking to Python:", err.message);
    res.status(500).json({ error: "Error connecting to ML server" });
  }
});

// Reset blink counter endpoint
app.post("/reset", async (req, res) => {
  try {
    const response = await axios.post(`${ML_SERVER}/reset`);
    res.json(response.data);
  } catch (err) {
    console.error("[Node] Error resetting ML server:", err.message);
    res.status(500).json({ error: "Could not reset ML server" });
  }
});

app.post('/reset', async (req, res) => {
  try {
    const pythonRes = await fetch('http://localhost:5000/reset', {
      method: 'POST'
    });
    const data = await pythonRes.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset Python server' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Node backend running at http://localhost:${PORT}`);
  console.log(`   Proxying ML requests to ${ML_SERVER}`);
});