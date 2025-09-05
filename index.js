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
const http = require("http");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// Initialize Express application
const app = express();
const server = http.createServer(app);

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
 * Creates a WebSocket connection to ElevenLabs agent for HTTP streaming
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
          case "agent_response_correction":
            console.log(
              "Agent response correction:",
              message.agent_response_correction_event?.agent_response
            );
            console.log(
              "New response incoming - previous audio stream will be replaced"
            );
            break;
          case "audio":
            console.log("Received audio from agent");

            if (message.audio_event?.audio_base_64 && ws.responseStream) {
              const buffer = Buffer.from(
                message.audio_event.audio_base_64,
                "base64"
              );

              console.log(`Received audio chunk (${buffer.length} bytes)`);

              // Split large chunks into 8000-byte parts and send immediately
              if (buffer.length > 8000) {
                const chunkSize = 8000;
                const totalChunks = Math.ceil(buffer.length / chunkSize);

                console.log(
                  `Splitting into ${totalChunks} parts of ${chunkSize} bytes each`
                );

                for (let i = 0; i < buffer.length; i += chunkSize) {
                  const chunk = buffer.subarray(i, i + chunkSize);
                  const chunkNum = Math.floor(i / chunkSize) + 1;

                  console.log(
                    `Sending part ${chunkNum}/${totalChunks} (${chunk.length} bytes)`
                  );

                  if (ws.responseStream && !ws.responseStream.destroyed) {
                    ws.responseStream.write(chunk);
                  } else {
                    console.log("Response stream unavailable, stopping");
                    break;
                  }
                }
              } else {
                // Small chunk, send directly
                console.log(`Sending small chunk (${buffer.length} bytes)`);
                if (ws.responseStream && !ws.responseStream.destroyed) {
                  ws.responseStream.write(buffer);
                }
              }
            }
            break;
          case "conversation_initiation_metadata":
            console.log(
              "Conversation initiated:",
              message.conversation_initiation_metadata_event
            );
            break;
          case "interruption":
            console.log("Conversation interrupted");
            break;
          case "ping":
            // Respond to ping with pong
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

      // End the response stream when WebSocket closes
      if (ws.responseStream && !ws.responseStream.destroyed) {
        console.log("Closing response stream due to WebSocket closure");
        ws.responseStream.end();
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);

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
 * Creates a WebSocket connection to ElevenLabs agent for WebSocket streaming
 * @param {string} agentId - The ElevenLabs agent ID
 * @param {WebSocket} clientWs - The client WebSocket connection
 * @returns {Promise<WebSocket>} - The WebSocket connection
 */
const createElevenLabsConnectionForWebSocket = async (agentId, clientWs) => {
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
            // Forward transcript to client
            clientWs.send(
              JSON.stringify({
                type: "transcript",
                transcript: message.user_transcription_event?.user_transcript,
              })
            );
            break;

          case "agent_response":
            console.log(
              "Agent response:",
              message.agent_response_event?.agent_response
            );
            // Forward agent response to client
            clientWs.send(
              JSON.stringify({
                type: "agent_response",
                response: message.agent_response_event?.agent_response,
              })
            );
            break;

          case "agent_response_correction":
            console.log(
              "Agent response correction:",
              message.agent_response_correction_event?.agent_response
            );
            console.log(
              "New response incoming - previous audio stream will be replaced"
            );
            break;

          // case "audio":
          //   console.log("Received audio from agent");
          //   // Forward audio to client
          //   if (message.audio_event?.audio_base_64) {
          //     clientWs.send(
          //       JSON.stringify({
          //         type: "audio",
          //         audio: message.audio_event.audio_base_64,
          //       })
          //     );
          //   }
          //   break;

          case "audio":
            console.log("Received audio from agent");

            if (message.audio_event?.audio_base_64 && ws.responseStream) {
              const buffer = Buffer.from(
                message.audio_event.audio_base_64,
                "base64"
              );

              console.log(`Received audio chunk (${buffer.length} bytes)`);

              // Split large chunks into 8000-byte parts and send immediately
              if (buffer.length > 8000) {
                const chunkSize = 8000;
                const totalChunks = Math.ceil(buffer.length / chunkSize);

                console.log(
                  `Splitting into ${totalChunks} parts of ${chunkSize} bytes each`
                );

                for (let i = 0; i < buffer.length; i += chunkSize) {
                  const chunk = buffer.subarray(i, i + chunkSize);
                  const chunkNum = Math.floor(i / chunkSize) + 1;

                  console.log(
                    `Sending part ${chunkNum}/${totalChunks} (${chunk.length} bytes)`
                  );

                  // if (ws.responseStream && !ws.responseStream.destroyed) {
                  //   ws.responseStream.write(chunk);
                  // } else {
                  //   console.log("Response stream unavailable, stopping");
                  //   break;
                  // }
                  clientWs.send(
                    JSON.stringify({
                      type: "audio",
                      audio: chunk,
                    })
                  );
                }
              } else {
                // Small chunk, send directly
                console.log(`Sending small chunk (${buffer.length} bytes)`);
                // if (ws.responseStream && !ws.responseStream.destroyed) {
                //   ws.responseStream.write(buffer);
                // }
                clientWs.send(
                  JSON.stringify({
                    type: "audio",
                    audio: buffer,
                  })
                );
              }
            }
            break;

          case "conversation_initiation_metadata":
            console.log(
              "Conversation initiated:",
              message.conversation_initiation_metadata_event
            );
            // Forward conversation metadata to client
            clientWs.send(
              JSON.stringify({
                type: "conversation_initiated",
                metadata: message.conversation_initiation_metadata_event,
              })
            );
            break;

          case "interruption":
            console.log("Conversation interrupted");
            // Forward interruption to client
            clientWs.send(
              JSON.stringify({
                type: "interruption",
              })
            );
            break;

          case "ping":
            // Respond to ping with pong
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
      // Notify client that ElevenLabs connection closed
      clientWs.send(
        JSON.stringify({
          type: "elevenlabs_disconnected",
        })
      );
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      // Notify client of ElevenLabs connection error
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: "ElevenLabs connection error",
        })
      );
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

      // Send audio chunk to ElevenLabs agent if WebSocket is ready
      if (ws && ws.readyState === WebSocket.OPEN) {
        const audioBase64 = audioChunk.toString("base64");
        const message = JSON.stringify({
          user_audio_chunk: audioBase64,
        });

        ws.send(message);
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
// app.post("/speech-to-speech-stream", handleAudioStream);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active connections
const activeConnections = new Map();

/**
 * Handles WebSocket connections from clients
 */
wss.on("connection", (clientWs, req) => {
  const clientId = uuidv4();
  const agentId = req.headers["x-agent-id"] || process.env.ELEVENLABS_AGENT_ID;

  console.log(`New WebSocket client connected: ${clientId}`);
  console.log(`Agent ID: ${agentId}`);

  if (!agentId) {
    clientWs.send(
      JSON.stringify({
        type: "error",
        message:
          "Agent ID is required. Provide via x-agent-id header or ELEVENLABS_AGENT_ID environment variable.",
      })
    );
    clientWs.close();
    return;
  }

  clientWs.send(JSON.stringify({ type: "connected", clientId, agentId }));

  // Store client connection
  activeConnections.set(clientId, {
    clientWs,
    agentId,
    elevenLabsWs: null,
    isConnected: false,
  });

  // Send connection confirmation

  // Handle incoming messages from client
  clientWs.on("message", async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "audio":
          await handleClientAudio(clientId, message.audio);
          break;
        case "ping":
          clientWs.send(
            JSON.stringify({
              type: "pong",
              timestamp: Date.now(),
            })
          );
          break;
        default:
          console.log(
            `Unknown message type from client ${clientId}:`,
            message.type
          );
      }
    } catch (error) {
      console.error(`Error processing message from client ${clientId}:`, error);
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        })
      );
    }
  });

  // Handle client disconnect
  clientWs.on("close", () => {
    console.log(`Client ${clientId} disconnected`);
    const connection = activeConnections.get(clientId);
    if (connection && connection.elevenLabsWs) {
      connection.elevenLabsWs.close();
    }
    activeConnections.delete(clientId);
  });

  // Handle client errors
  clientWs.on("error", (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    const connection = activeConnections.get(clientId);
    if (connection && connection.elevenLabsWs) {
      connection.elevenLabsWs.close();
    }
    activeConnections.delete(clientId);
  });
});

/**
 * Handles audio data from client and forwards to ElevenLabs
 */
const handleClientAudio = async (clientId, audioData) => {
  const connection = activeConnections.get(clientId);
  if (!connection) {
    console.error(`No connection found for client ${clientId}`);
    return;
  }

  // Create ElevenLabs connection if not exists
  if (
    !connection.elevenLabsWs ||
    connection.elevenLabsWs.readyState === WebSocket.CLOSED
  ) {
    try {
      console.log(`Creating ElevenLabs connection for client ${clientId}`);
      connection.elevenLabsWs = await createElevenLabsConnectionForWebSocket(
        connection.agentId,
        connection.clientWs
      );
      connection.isConnected = true;
    } catch (error) {
      console.error(
        `Failed to create ElevenLabs connection for client ${clientId}:`,
        error
      );
      connection.clientWs.send(
        JSON.stringify({
          type: "error",
          message: "Failed to connect to ElevenLabs agent",
        })
      );
      return;
    }
  }

  // Send audio to ElevenLabs if connection is ready
  if (
    connection.elevenLabsWs &&
    connection.elevenLabsWs.readyState === WebSocket.OPEN
  ) {
    const message = JSON.stringify({
      user_audio_chunk: audioData,
    });
    connection.elevenLabsWs.send(message);
  } else {
    console.warn(`ElevenLabs connection not ready for client ${clientId}`);
  }
};

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
server.listen(PORT, async () => {
  console.log(`ElevenLabs Speech-to-Speech server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
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
