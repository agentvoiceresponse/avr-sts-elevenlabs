# Agent Voice Response - Elevenlabs Speech-to-Speech Integration

[![Discord](https://img.shields.io/discord/1347239846632226998?label=Discord&logo=discord)](https://discord.gg/DFTU69Hg74)
[![GitHub Repo stars](https://img.shields.io/github/stars/agentvoiceresponse/avr-sts-elevenlabs?style=social)](https://github.com/agentvoiceresponse/avr-sts-elevenlabs)
[![Docker Pulls](https://img.shields.io/docker/pulls/agentvoiceresponse/avr-sts-elevenlabs?label=Docker%20Pulls&logo=docker)](https://hub.docker.com/r/agentvoiceresponse/avr-sts-elevenlabs)
[![Ko-fi](https://img.shields.io/badge/Support%20us%20on-Ko--fi-ff5e5b.svg)](https://ko-fi.com/agentvoiceresponse)

This repository showcases the integration between **Agent Voice Response** and **Elevenlabs Real-time Speech-to-Speech API**. The application leverages Elevenlabs' powerful language model to process audio input from users, providing intelligent, context-aware responses in real-time audio format.

## Features

- **WebSocket Support**: Real-time bidirectional audio streaming via WebSocket connections
- **ElevenLabs Integration**: Direct integration with ElevenLabs Speech-to-Speech API
- **Real-time Audio Processing**: Low-latency audio streaming with chunking support
- **Transcript Forwarding**: Real-time transcript forwarding for both user and agent speech
- **Connection Management**: Automatic connection handling and cleanup

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

#### Required Configuration

- `ELEVENLABS_AGENT_ID`: Your ElevenLabs agent ID (required)
- `ELEVENLABS_API_KEY`: Your ElevenLabs API key (optional - only required for private agents)
- `PORT`: Server port (default: 6035)

### ⚠️ Important Audio Format Requirements

**Before using this integration, you MUST configure your ElevenLabs agent with the following audio settings:**

1. **User Input Audio Format**: Set to **PCM 8000 Hz**
2. **TTS Output Format**: Set to **PCM 8000 Hz**

These settings are crucial for proper audio compatibility and real-time streaming performance.

## Usage

### Starting the Server

```bash
npm install
npm start
```

The server will start on the configured port (default: 6035) and display connection information.

### WebSocket Connection

Connect to the WebSocket server at `ws://localhost:6035` (or your configured port).

### Message Protocol

#### Client to Server Messages

**Initialize Connection:**

```json
{
  "type": "init"
}
```

**Send Audio Data:**

```json
{
  "type": "audio",
  "audio": "<base64_encoded_audio_data>"
}
```

#### Server to Client Messages

**Transcript Messages:**

```json
{
  "type": "transcript",
  "role": "user|agent",
  "text": "transcribed text"
}
```

**Audio Response:**

```json
{
  "type": "audio",
  "audio": "<base64_encoded_audio_data>"
}
```

**Interruption:**

```json
{
  "type": "interruption"
}
```

**Error Messages:**

```json
{
  "type": "error",
  "message": "error description"
}
```

### Example Usage

```javascript
const ws = new WebSocket("ws://localhost:6035");

ws.onopen = () => {
  // Initialize the connection
  ws.send(JSON.stringify({ type: "init" }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "connected":
      console.log("Connected to server");
      break;
    case "transcript":
      console.log(`${message.role}: ${message.text}`);
      break;
    case "audio":
      // Handle audio data
      const audioData = message.audio;
      // Play or process the audio
      break;
    case "interruption":
      console.log("Conversation interrupted");
      break;
    case "error":
      console.error("Error:", message.message);
      break;
  }
};

// Send audio data
function sendAudio(audioBuffer) {
  const base64Audio = audioBuffer.toString("base64");
  ws.send(
    JSON.stringify({
      type: "audio",
      audio: base64Audio,
    })
  );
}
```

## Audio Processing

The service handles real-time audio streaming with the following features:

- **Audio Chunking**: Large audio chunks are automatically split into 8000-byte parts for optimal streaming
- **Base64 Encoding**: All audio data is transmitted as base64-encoded strings
- **Real-time Transcripts**: Both user and agent speech are transcribed and forwarded
- **Connection Management**: Automatic cleanup and error handling

## Error Handling

The service handles various error scenarios:

- Missing required environment variables (ELEVENLABS_AGENT_ID)
- Invalid ElevenLabs API responses
- WebSocket connection failures
- Audio processing errors
- Agent capacity limits (error 4300)

## Docker Support

```bash
# Build the image
docker build -t avr-sts-elevenlabs .

# Run with environment file
docker run --env-file .env -p 6035:6035 avr-sts-elevenlabs
```

## Support & Community

- **GitHub:** [https://github.com/agentvoiceresponse](https://github.com/agentvoiceresponse) - Report issues, contribute code.
- **Discord:** [https://discord.gg/DFTU69Hg74](https://discord.gg/DFTU69Hg74) - Join the community discussion.
- **Docker Hub:** [https://hub.docker.com/u/agentvoiceresponse](https://hub.docker.com/u/agentvoiceresponse) - Find Docker images.
- **Wiki:** [https://wiki.agentvoiceresponse.com/en/home](https://wiki.agentvoiceresponse.com/en/home) - Project documentation and guides.

## Support AVR

AVR is free and open-source. If you find it valuable, consider supporting its development:

<a href="https://ko-fi.com/agentvoiceresponse" target="_blank"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support us on Ko-fi"></a>

## License

MIT License - see the [LICENSE](LICENSE.md) file for details.
