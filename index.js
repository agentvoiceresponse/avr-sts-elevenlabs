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
 * Creates a WebSocket connection to ElevenLabs agent
 * @param {string} agentId - The ElevenLabs agent ID
 * @returns {Promise<WebSocket>} - The WebSocket connection
 */
const createElevenLabsConnection = async (agentId) => {
  try {
    let wsUrl;

    // Audio configuration - ElevenLabs typically uses 24kHz by default
    // Let's try to explicitly request a specific format
    const audioConfig = {}; // Start without config to see default format first

    // Check if we need to use signed URL (for private agents)
    if (process.env.ELEVENLABS_API_KEY) {
      // Get signed URL for private agents with audio configuration
      const queryParams = new URLSearchParams({
        agent_id: agentId,
        ...audioConfig,
      });

      const response = await axios.get(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${queryParams}`,
        {
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
          },
        }
      );
      wsUrl = response.data.signed_url;
    } else {
      // Use direct connection for public agents with audio configuration
      const queryParams = new URLSearchParams({
        agent_id: agentId,
        ...audioConfig,
      });
      wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?${queryParams}`;
    }

    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log("WebSocket connection established");
    });

    // This will be set from the handleAudioStream function
    ws.responseStream = null;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        console.log("Received message:", message.type || "unknown");

        switch (message.type) {
          case "user_transcript":
            console.log(
              "User transcript:",
              message.user_transcription_event?.user_transcript
            );
            break;
          case "agent_response":
            console.log(
              "Agent response:",
              message.agent_response_event?.agent_response
            );
            break;
          case "audio":
            console.log("Received audio from agent");
            // Stream audio data back to client
            if (message.audio_event?.audio_base_64 && ws.responseStream) {
              const audioBuffer = Buffer.from(
                message.audio_event.audio_base_64,
                "base64"
              );
              console.log(`Audio chunk size: ${audioBuffer.length} bytes`);

              // Add to audio buffer for potential processing
              if (!ws.audioChunksQueue) {
                ws.audioChunksQueue = Buffer.alloc(0);
                ws.isFirstAudioChunk = true;
                ws.audioStartTime = Date.now();
              }

              // Accumulate audio chunks
              ws.audioChunksQueue = Buffer.concat([
                ws.audioChunksQueue,
                audioBuffer,
              ]);

              // Similar to Ultravox example - add some buffering for smoother playback
              if (ws.isFirstAudioChunk) {
                ws.isFirstAudioChunk = false;
                console.log("First audio chunk received, starting playback...");
              }

              // Write accumulated buffer if we have enough data
              if (ws.audioChunksQueue.length >= 1024) {
                // Minimum buffer size
                const bufferToWrite = ws.audioChunksQueue;
                ws.audioChunksQueue = Buffer.alloc(0);
                ws.responseStream.write(bufferToWrite);
              }
            }
            break;
          case "conversation_initiation_metadata":
            console.log(
              "Conversation initiated:",
              message.conversation_initiation_metadata_event
            );
            break;
          case "ping":
            // Respond to ping with pong
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          default:
            console.log("Unknown message type:", message);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    });

    ws.on("close", (code, reason) => {
      console.log("WebSocket connection closed:", code, reason);

      // Flush any remaining audio buffer before closing
      if (
        ws.audioChunksQueue &&
        ws.audioChunksQueue.length > 0 &&
        ws.responseStream &&
        !ws.responseStream.destroyed
      ) {
        console.log(
          `Flushing final audio buffer: ${ws.audioChunksQueue.length} bytes`
        );
        ws.responseStream.write(ws.audioChunksQueue);
      }

      // End the response stream when WebSocket closes
      if (ws.responseStream && !ws.responseStream.destroyed) {
        ws.responseStream.end();
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      // End the response stream on error
      if (ws.responseStream && !ws.responseStream.destroyed) {
        ws.responseStream.end();
      }
    });

    return ws;
  } catch (error) {
    console.error("Failed to create ElevenLabs connection:", error);
    throw error;
  }
};

/**
 * Handles incoming client audio stream and manages communication with ElevenLabs API.
 * Streams audio responses from the agent back to the client in real-time.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
const handleAudioStream = async (req, res) => {
  const uuid = req.headers["x-uuid"];
  const agentId = req.headers["x-agent-id"] || process.env.ELEVENLABS_AGENT_ID;

  console.log("Received UUID:", uuid);
  console.log("Agent ID:", agentId);

  if (!agentId) {
    return res.status(400).json({
      error:
        "Agent ID is required. Provide via x-agent-id header or ELEVENLABS_AGENT_ID environment variable.",
    });
  }

  // Set headers for audio streaming
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Transfer-Encoding", "chunked");

  // Add audio format information for client (if needed)
  res.setHeader("X-Audio-Sample-Rate", "24000"); // ElevenLabs default
  res.setHeader("X-Audio-Format", "PCM");
  res.setHeader("X-Audio-Channels", "1"); // Mono
  res.setHeader("X-Audio-Bit-Depth", "16");

  let audioBuffer = Buffer.alloc(0);
  let ws;

  // Create WebSocket connection
  try {
    ws = await createElevenLabsConnection(agentId);

    // Set the response stream for audio streaming back to client
    ws.responseStream = res;

    // Wait for connection to be established
    await new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) {
        resolve();
      } else {
        ws.on("open", resolve);
        ws.on("error", reject);
        // Timeout after 10 seconds
        setTimeout(
          () => reject(new Error("WebSocket connection timeout")),
          10000
        );
      }
    });
  } catch (error) {
    console.error("Failed to establish WebSocket connection:", error);
    return res
      .status(500)
      .json({ error: "Failed to connect to ElevenLabs agent" });
  }

  // Handle incoming audio data from client
  req.on("data", async (audioChunk) => {
    try {
      // Accumulate audio data
      audioBuffer = Buffer.concat([audioBuffer, audioChunk]);

      // Send audio chunk to ElevenLabs agent if WebSocket is ready
      if (ws && ws.readyState === WebSocket.OPEN) {
        const audioBase64 = audioChunk.toString("base64");
        const message = JSON.stringify({
          user_audio_chunk: audioBase64,
        });

        ws.send(message);
        console.log(`Sent audio chunk (${audioChunk.length} bytes)`);
      } else {
        console.warn("WebSocket not ready, buffering audio chunk");
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  });

  req.on("end", () => {
    console.log("Request stream ended");

    // Close WebSocket connection after a delay to allow agent to finish response
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 1000); // Wait 1 second for any remaining audio
  });

  req.on("error", (err) => {
    console.error("Request error:", err);

    // Close WebSocket connection on error
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }

    // End the response stream on error
    if (!res.destroyed) {
      res.end();
    }
  });
};

// Route for speech-to-speech streaming
app.post("/speech-to-speech-stream", handleAudioStream);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

const PORT = process.env.PORT || 6035;
app.listen(PORT, async () => {
  console.log(`ElevenLabs Speech-to-Speech server running on port ${PORT}`);
  console.log("Required environment variables:");
  console.log(
    "- ELEVENLABS_AGENT_ID: Your ElevenLabs agent ID (can also be passed via x-agent-id header)"
  );
  console.log(
    "- ELEVENLABS_API_KEY: Your ElevenLabs API key (optional for public agents)"
  );
});
