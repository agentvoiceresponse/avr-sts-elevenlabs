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
const WebSocket = require("ws");
require("dotenv").config();

// Initialize Express application
const app = express();

/**
 * Gets a signed URL for private agent conversations
 * @param {string} agentId - The ElevenLabs agent ID
 * @param {string} apiKey - The ElevenLabs API key
 * @returns {Promise<string>} - The signed WebSocket URL
 */
const getSignedUrl = async (agentId, apiKey) => {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to get signed URL: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.signed_url;
};

/**
 * Creates a WebSocket connection to ElevenLabs agent
 * @param {string} agentId - The ElevenLabs agent ID
 * @returns {Promise<WebSocket>} - The WebSocket connection
 */
const createElevenLabsConnection = async (agentId) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    let wsUrl;

    if (apiKey) {
      // For private agents, get a signed URL
      console.log("Getting signed URL for private agent");
      wsUrl = await getSignedUrl(agentId, apiKey);
    } else {
      // For public agents, use direct URL
      console.log("Connecting to public agent");
      wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;
    }

    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log("WebSocket connection established");
    });

    // This will be set from the handleAudioStream function
    ws.responseStream = null;

    let outputChunksQueue = Buffer.alloc(0);
    let isFirstOutputChunk = true;
    let isSendingChunks = false;

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

            if (message.audio_event?.audio_base_64 && ws.responseStream) {
              const buffer = Buffer.from(
                message.audio_event.audio_base_64,
                "base64"
              );

              if (isFirstOutputChunk) {
                outputStartTime = Date.now();
                isFirstOutputChunk = false;
              }

              outputChunksQueue = Buffer.concat([outputChunksQueue, buffer]);

              // Only process if not currently sending chunks
              if (!isSendingChunks) {
                // Check if buffer is greater than 8000 bytes
                if (outputChunksQueue.length > 8000) {
                  console.log(
                    `Large buffer detected (${outputChunksQueue.length} bytes), chunking...`
                  );

                  // Set flag to prevent overlapping sends
                  isSendingChunks = true;

                  // Split buffer into chunks of 8000 bytes or less
                  const chunkSize = 8000;
                  const chunks = [];

                  for (
                    let i = 0;
                    i < outputChunksQueue.length;
                    i += chunkSize
                  ) {
                    const chunk = outputChunksQueue.subarray(i, i + chunkSize);
                    chunks.push(chunk);
                  }

                  console.log(`Split into ${chunks.length} chunks`);

                  // Clear the queue before processing
                  outputChunksQueue = Buffer.alloc(0);

                  // Send chunks sequentially with 100ms delay between each
                  const sendChunksSequentially = async (chunks) => {
                    try {
                      for (let i = 0; i < chunks.length; i++) {
                        if (ws.responseStream && !ws.responseStream.destroyed) {
                          console.log(
                            `Sending chunk ${i + 1}/${chunks.length} (${
                              chunks[i].length
                            } bytes)`
                          );
                          ws.responseStream.write(chunks[i]);

                          // Wait 100ms before sending the next chunk (except for the last one)
                          if (i < chunks.length - 1) {
                            await new Promise((resolve) =>
                              setTimeout(resolve, 100)
                            );
                          }
                        } else {
                          console.log(
                            `Response stream unavailable, stopping at chunk ${
                              i + 1
                            }`
                          );
                          break;
                        }
                      }
                    } finally {
                      // Always reset the flag when done
                      isSendingChunks = false;
                      console.log(
                        "Finished sending chunks, ready for next batch"
                      );
                    }
                  };

                  // Start sending chunks asynchronously but don't block the main flow
                  sendChunksSequentially(chunks).catch((error) => {
                    console.error("Error sending chunks sequentially:", error);
                    isSendingChunks = false; // Reset flag on error
                  });
                } else {
                  // Normal flush for smaller buffers
                  const toWrite = outputChunksQueue;
                  console.log("Flushing buffer", toWrite.length);
                  outputChunksQueue = Buffer.alloc(0);
                  outputStartTime = Date.now();
                  ws.responseStream.write(toWrite);
                }
              } else {
                console.log(
                  `Currently sending chunks, buffering ${buffer.length} bytes (total queue: ${outputChunksQueue.length} bytes)`
                );
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
            // Received ping { ping_event: { event_id: 2, ping_ms: null }, type: 'ping' }
            console.log("Received ping", message);
            ws.send(
              JSON.stringify({
                type: "pong",
                event_id: message.ping_event.event_id,
              })
            );
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

      // Reset chunking state
      isSendingChunks = false;
      outputChunksQueue = Buffer.alloc(0);

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
        console.log("Closing response stream due to WebSocket closure");
        ws.responseStream.end();
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);

      // Reset chunking state
      isSendingChunks = false;
      outputChunksQueue = Buffer.alloc(0);

      // End the response stream on error
      if (ws.responseStream && !ws.responseStream.destroyed) {
        console.log("Closing response stream due to WebSocket error");
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

    // Check if it's a signed URL error (authentication issue)
    if (error.message.includes("Failed to get signed URL")) {
      return res.status(401).json({
        error: "Authentication failed: " + error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to connect to ElevenLabs agent: " + error.message,
    });
  }

  // Handle incoming audio data from client
  req.on("data", async (audioChunk) => {
    try {
      // Stop processing if WebSocket is closed
      if (
        !ws ||
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING
      ) {
        console.log("WebSocket closed, ignoring incoming audio chunk");
        return;
      }

      // Accumulate audio data
      // audioBuffer = Buffer.concat([audioBuffer, audioChunk]);
      // console.log(
      //   "audioChunk length and timestamp in ms: ",
      //   audioChunk.length,
      //   Date.now()
      // );
      // Send audio chunk to ElevenLabs agent if WebSocket is ready
      if (ws && ws.readyState === WebSocket.OPEN) {
        const audioBase64 = audioChunk.toString("base64");
        const message = JSON.stringify({
          user_audio_chunk: audioBase64,
        });

        ws.send(message);
        // console.log(`Sent audio chunk (${audioChunk.length} bytes)`);
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
  console.log("Environment variables:");
  console.log(
    "- ELEVENLABS_AGENT_ID: Your ElevenLabs agent ID (can also be passed via x-agent-id header)"
  );
  console.log(
    "- ELEVENLABS_API_KEY: Your ElevenLabs API key (optional - only required for private agents)"
  );

  // Check if API key is set
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log(
      "ℹ️  No API key set - will attempt to connect to public agents only"
    );
  } else {
    console.log(
      "✅ ELEVENLABS_API_KEY is configured - can access both public and private agents"
    );
  }
});
