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

const WebSocket = require("ws");
require("dotenv").config();
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
 * Creates a WebSocket connection to ElevenLabs agent for WebSocket streaming
 * @param {string} agentId - The ElevenLabs agent ID
 * @param {WebSocket} clientWs - The client WebSocket connection
 * @returns {Promise<WebSocket>} - The WebSocket connection
 */
const createElevenLabsConnectionForWebSocket = async (agentId) => {
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

    return ws;
  } catch (error) {
    console.error("Failed to create ElevenLabs connection:", error);
    throw error;
  }
};

// Create WebSocket server
const PORT = process.env.PORT || 6035;
const wss = new WebSocket.Server({ port: PORT });

/**
 * Handles WebSocket connections from clients
 */
wss.on("connection", (clientWs) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID || null;
  let wsElevenLabs = null;

  console.log(`New WebSocket client connected`);
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

  // Handle incoming messages from client
  clientWs.on("message", async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "audio":
          if (wsElevenLabs) {
            if (wsElevenLabs.readyState === WebSocket.OPEN) {
              wsElevenLabs.send(
                JSON.stringify({
                  user_audio_chunk: message.audio.toString("base64"),
                })
              );
            }
          }
          break;

        case "init":
          // init elevenlabs connection
          wsElevenLabs = await createElevenLabsConnectionForWebSocket(agentId);
          wsElevenLabs.on("message", (data) => {
            try {
              const message = JSON.parse(data);
              console.log("Received message:", message.type || "unknown");

              switch (message.type) {
                case "agent_response":
                  console.log(
                    "Agent response:",
                    message.agent_response_event?.agent_response
                  );
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(
                      JSON.stringify({
                        type: "transcript",
                        role: "agent",
                        text: message.agent_response_event?.agent_response,
                      })
                    );
                  }
                  break;
                case "user_transcript":
                  console.log(
                    "User transcript:",
                    message.user_transcription_event?.user_transcript
                  );
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(
                      JSON.stringify({
                        type: "transcript",
                        role: "user",
                        text: message.user_transcription_event?.user_transcript,
                      })
                    );
                  }
                  break;

                case "agent_response_correction":
                  console.log(
                    "Agent response correction:",
                    message.agent_response_correction_event?.agent_response
                  );
                  console.log(
                    "New response incoming - previous audio stream will be replaced"
                  );
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(
                      JSON.stringify({
                        type: "interruption",
                      })
                    );
                  }
                  break;

                case "audio":
                  if (
                    message.audio_event?.audio_base_64 &&
                    wsElevenLabs.readyState === WebSocket.OPEN
                  ) {
                    const buffer = Buffer.from(
                      message.audio_event.audio_base_64,
                      "base64"
                    );

                    console.log(
                      `Received audio chunk (${buffer.length} bytes)`
                    );

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

                        if (clientWs.readyState === WebSocket.OPEN) {
                          clientWs.send(
                            JSON.stringify({
                              type: "audio",
                              audio: chunk,
                            })
                          );
                        }
                      }
                    } else {
                      // Small chunk, send directly
                      console.log(
                        `Sending small chunk (${buffer.length} bytes)`
                      );
                      if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(
                          JSON.stringify({
                            type: "audio",
                            audio: buffer,
                          })
                        );
                      }
                    }
                  }
                  break;

                case "interruption":
                  console.log("Conversation interrupted");
                  // Forward interruption to client
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(
                      JSON.stringify({
                        type: "interruption",
                      })
                    );
                  }
                  break;

                case "ping":
                  // Respond to ping with pong
                  console.log("Received ping", message);
                  if (wsElevenLabs.readyState === WebSocket.OPEN) {
                    wsElevenLabs.send(
                      JSON.stringify({
                        type: "pong",
                        event_id: message.ping_event.event_id,
                      })
                    );
                  }
                  break;

                default:
                  console.log("Unknown message type:", message);
              }
            } catch (error) {
              console.error("Error parsing WebSocket message:", error);
            }
          });

          wsElevenLabs.on("close", (code, reason) => {
            console.log("WebSocket connection closed:", code, reason);
            // Notify client that ElevenLabs connection closed
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: "elevenlabs_disconnected",
                })
              );
            }
          });

          wsElevenLabs.on("error", (error) => {
            console.error("WebSocket error:", error);
            // Notify client of ElevenLabs connection error
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  message: "ElevenLabs connection error",
                })
              );
            }
          });
          break;
        default:
          console.log(`Unknown message type from client:`, message.type);
      }
    } catch (error) {
      console.error(`Error processing message from client:`, error);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
          })
        );
      }
    }
  });

  // Handle client disconnect
  clientWs.on("close", () => {
    console.log(`Client disconnected`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
    if (wsElevenLabs && wsElevenLabs.readyState === WebSocket.OPEN) {
      wsElevenLabs.close();
    }
  });

  // Handle client errors
  clientWs.on("error", (error) => {
    console.error(`WebSocket error for client:`, error);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
    if (wsElevenLabs && wsElevenLabs.readyState === WebSocket.OPEN) {
      wsElevenLabs.close();
    }
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

console.log(`WebSocket server running on port ${PORT}`);
console.log("Environment variables:");
console.log("- ELEVENLABS_AGENT_ID: Your ElevenLabs agent ID");
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
