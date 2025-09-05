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

/**
 * Handles incoming client WebSocket connection and manages communication with ElevenLabs's API.
 *
 * @param {WebSocket} clientWs - Client WebSocket connection
 */
const handleClientConnection = (clientWs) => {
  console.log("New client WebSocket connection received");
  const agentId = process.env.ELEVENLABS_AGENT_ID || null;
  let wsElevenLabs = null;

  console.log(`Agent ID: ${agentId}`);

  if (!agentId) {
    clientWs.send(
      JSON.stringify({
        type: "error",
        message:
          "Agent ID is required. Provide via ELEVENLABS_AGENT_ID environment variable.",
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
          if (wsElevenLabs && wsElevenLabs.readyState === WebSocket.OPEN) {
            wsElevenLabs.send(
              JSON.stringify({
                user_audio_chunk: message.audio.toString("base64"),
              })
            );
          }
          break;

        case "init":
          // Initialize ElevenLabs connection when client is ready
          initializeElevenLabsConnection();
          break;

        default:
          console.log(`Unknown message type from client:`, message.type);
      }
    } catch (error) {
      console.error(`Error processing message from client:`, error);
      clientWs.close();
    }
  });

  // Initialize ElevenLabs WebSocket connection
  const initializeElevenLabsConnection = async () => {
    try {
      wsElevenLabs = await createElevenLabsConnectionForWebSocket(agentId);

      wsElevenLabs.on("message", (data) => {
        try {
          const message = JSON.parse(data);
          switch (message.type) {
            case "agent_response":
              console.log("Received agent response message");
              clientWs.send(
                JSON.stringify({
                  type: "transcript",
                  role: "agent",
                  text: message.agent_response_event?.agent_response,
                })
              );
              break;
            case "user_transcript":
              console.log("Received user transcript message");
              clientWs.send(
                JSON.stringify({
                  type: "transcript",
                  role: "user",
                  text: message.user_transcription_event?.user_transcript,
                })
              );
              break;

            case "agent_response_correction":
              console.log("Received agent response correction message");
              clientWs.send(
                JSON.stringify({
                  type: "interruption",
                })
              );
              break;

            case "audio":
              clientWs.send(
                JSON.stringify({
                  type: "audio",
                  audio: message.audio_event.audio_base_64,
                })
              );
              break;

            case "interruption":
              console.log("Received interruption message");
              clientWs.send(
                JSON.stringify({
                  type: "interruption",
                })
              );
              break;

            case "ping":
              wsElevenLabs.send(
                JSON.stringify({
                  type: "pong",
                  event_id: message.ping_event.event_id,
                })
              );
              break;

            default:
              console.log("Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      });

      wsElevenLabs.on("close", () => {
        console.log("ElevenLabs connection closed");
        cleanup();
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
    } catch (error) {
      console.error("Failed to initialize ElevenLabs connection:", error);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: "Failed to connect to ElevenLabs",
          })
        );
      }
    }
  };

  // Handle client WebSocket close
  clientWs.on("close", () => {
    console.log("Client WebSocket connection closed");
    cleanup();
  });

  clientWs.on("error", (err) => {
    console.error("Client WebSocket error:", err);
    cleanup();
  });

  /**
   * Cleans up resources and closes connections.
   */
  function cleanup() {
    if (wsElevenLabs) wsElevenLabs.close();
    if (clientWs) clientWs.close();
  }
};

// Handle process termination signals
process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Initialize and start server
const startServer = async () => {
  try {
    // Create WebSocket server
    const PORT = process.env.PORT || 6035;
    const wss = new WebSocket.Server({ port: PORT });

    wss.on("connection", (clientWs) => {
      console.log("New client connected");
      handleClientConnection(clientWs);
    });

    console.log(
      `ElevenLabs Speech-to-Speech WebSocket server running on port ${PORT}`
    );
    console.log("Environment variables:");
    console.log("- ELEVENLABS_AGENT_ID: Your ElevenLabs agent ID");
    console.log(
      "- ELEVENLABS_API_KEY: Your ElevenLabs API key (optional - only required for private agents)"
    );

    // Check if API key is set
    if (!process.env.ELEVENLABS_API_KEY) {
      console.log(
        "No API key set - will attempt to connect to public agents only"
      );
    } else {
      console.log(
        "ELEVENLABS_API_KEY is configured - can access both public and private agents"
      );
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();
