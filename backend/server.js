const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

app.post("/analyze", async (req, res) => {
  try {
    const response = await axios.post(
      "http://localhost:5000/analyze",
      req.body
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).send("Error");
  }
});

app.listen(4000, () => console.log("Server running on 4000"));