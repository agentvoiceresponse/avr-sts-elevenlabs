# Agent Voice Response - Elevenlabs Speech-to-Speech Integration

[![Discord](https://img.shields.io/discord/1347239846632226998?label=Discord&logo=discord)](https://discord.gg/DFTU69Hg74)
[![GitHub Repo stars](https://img.shields.io/github/stars/agentvoiceresponse/avr-sts-elevenlabs?style=social)](https://github.com/agentvoiceresponse/avr-sts-elevenlabs)
[![Docker Pulls](https://img.shields.io/docker/pulls/agentvoiceresponse/avr-sts-elevenlabs?label=Docker%20Pulls&logo=docker)](https://hub.docker.com/r/agentvoiceresponse/avr-sts-elevenlabs)
[![Ko-fi](https://img.shields.io/badge/Support%20us%20on-Ko--fi-ff5e5b.svg)](https://ko-fi.com/agentvoiceresponse)

This repository showcases the integration between **Agent Voice Response** and **Elevenlabs Real-time Speech-to-Speech API**. The application leverages Elevenlabs' powerful language model to process audio input from users, providing intelligent, context-aware responses in real-time audio format.

## Features

- **Dual Call Types**: Support for both agent-specific calls and generic calls
- **Real-time Streaming**: WebSocket-based audio streaming with buffering
- **External Voice Support**: Integration with ElevenLabs, Cartesia, LMNT, and generic voice providers
- **Configurable Audio Settings**: Customizable sample rates and buffer sizes
- **Tool Integration**: Support for custom tools and VAD settings

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

#### Basic Configuration
- `PORT`: Server port (default: 6035)

## Usage

### Starting the Server

```bash
npm install
npm start
```

### Making Requests

Send a POST request to `/speech-to-speech-stream` with:

- **Headers:**
  - `x-uuid`: Unique identifier for the call
  - `Content-Type`: `audio/wav` (or appropriate audio format)

- **Body:** Raw audio data stream

### Example Usage



## API Response

The service returns a stream of audio data from Ultravox. The response includes:

- Real-time audio chunks from the AI
- JSON control messages for call state management
- Transcript information

## Error Handling

The service handles various error scenarios:

- Missing required environment variables
- Invalid API responses
- WebSocket connection failures
- Audio processing errors

## Docker Support

```bash
# Build the image
docker build -t avr-sts-elevenlabs .

# Run with environment file
docker run --env-file .env -p 6031:6031 avr-sts-elevenlabs
```

## Support & Community

*   **GitHub:** [https://github.com/agentvoiceresponse](https://github.com/agentvoiceresponse) - Report issues, contribute code.
*   **Discord:** [https://discord.gg/DFTU69Hg74](https://discord.gg/DFTU69Hg74) - Join the community discussion.
*   **Docker Hub:** [https://hub.docker.com/u/agentvoiceresponse](https://hub.docker.com/u/agentvoiceresponse) - Find Docker images.
*   **Wiki:** [https://wiki.agentvoiceresponse.com/en/home](https://wiki.agentvoiceresponse.com/en/home) - Project documentation and guides.

## Support AVR

AVR is free and open-source. If you find it valuable, consider supporting its development:

<a href="https://ko-fi.com/agentvoiceresponse" target="_blank"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support us on Ko-fi"></a>

## License

MIT License - see the [LICENSE](LICENSE.md) file for details.
