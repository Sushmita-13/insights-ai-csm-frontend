# Conversational AI Dashboard

This is a Next.js-based frontend designed for interacting with a Conversational AI backend. It allows users to record their voice and receive real-time transcriptions.

## Features

- **Voice Recording**: Integrated `MediaRecorder` API to capture audio directly from the browser.
- **Real-time Status Updates**: Visual indicators for service connectivity (Online/Offline) and recording states (Idle, Recording, Processing).
- **STT Integration**: Connects to a FastAPI backend for processing audio files.
- **Modern UI**: Styled with Tailwind CSS for a clean, responsive dashboard experience.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)

## Getting Started

### Prerequisites

This frontend expects a backend service running locally at:
- **Base URL**: `http://localhost:8000`
- **WebSocket Query**: `/ws/query` (Unified pipeline)

### Installation

1. Install dependencies:
   ```bash
   npm install