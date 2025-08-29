/**
 * index.js
 * Entry point for the ElevenLabs Speech-to-Speech streaming application.
 * This server handles real-time audio streaming between clients and ElevenLabs's API,
 * performing necessary audio format conversions and WebSocket communication.
 * Supports both agent-specific calls and generic calls.
 *
 * @author Agent Voice Response <info@agentvoiceresponse.com>
 * @see https://www.agentvoiceresponse.com
 */

const express = require("express");
const axios = require("axios");
const WebSocket = require("ws");
require("dotenv").config();

// Initialize Express application
const app = express();

/**
 * Handles incoming client audio stream and manages communication with ElevenLabs API.
 * Implements buffering for audio chunks received before WebSocket connection is established.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
const handleAudioStream = async (req, res) => {
  const uuid = req.headers['x-uuid'];
  console.log('Received UUID:', uuid);

  // Handle incoming audio data from client
  req.on("data", async (audioChunk) => {

  });

  req.on("end", () => {
    console.log("Request stream ended");
  });

  req.on("error", (err) => {
    console.error("Request error:", err);
  });
};

// Route for speech-to-speech streaming
app.post("/speech-to-speech-stream", handleAudioStream);

const PORT = process.env.PORT || 6035;
app.listen(PORT, async () => {
  console.log(`ElevenLabs Speech-to-Speech server running on port ${PORT}`);
});
