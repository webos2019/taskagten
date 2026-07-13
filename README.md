# Code Assistant

A chat-based code assistant with tool integration capabilities.

## Features

- Chat interface with AI-powered responses
- Tool integration system (weather, file reading, calculator, etc.)
- Skill-based architecture for organizing tools
- Real-time SSE streaming for chat responses

## Tech Stack

- Next.js 14+
- TypeScript
- Tailwind CSS
- LangChain

## Getting Started

### Prerequisites

- Node.js 18+
- DeepSeek API key

### Installation

```bash
npm install
```

### Configuration

Create a `.env.local` file with your DeepSeek API key:

```env
DEEPSEEK_API_KEY=your-api-key-here
```

### Development

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### Production

```bash
npm run build
npm start
```

## Project Structure

```
app/
  api/           # API routes
  components/    # UI components
  hooks/         # Custom hooks
lib/
  tool-registry.ts  # Tool registration system
types/           # TypeScript types
```

## License

MIT
