# ChaiChat

A beautiful, modern interface for chatting with AI models running locally through Ollama. Built with React, TypeScript, and shadcn/ui components for the best user experience.

## ✨ Features

- 🎨 **Beautiful Design** - Modern UI built with shadcn/ui components
- 🌙 **Dark/Light Mode** - Automatic theme switching with manual override
- 🚀 **Fast & Responsive** - Built with modern React and optimized for performance
- 🔒 **Privacy First** - All conversations run locally on your machine
- 🤖 **Multiple Models** - Support for various AI models through Ollama
- 📱 **Mobile Friendly** - Responsive design that works on all devices
- ⌨️ **Keyboard Shortcuts** - Enter to send, Shift+Enter for new lines
- 📋 **Copy Messages** - Easy copy functionality for chat messages
- 🔄 **Auto-scroll** - Automatic scrolling to latest messages

## 🛠️ Tech Stack

- **React 19** - Latest React with concurrent features
- **TypeScript** - Type-safe development experience
- **TanStack Router** - Type-safe routing for React
- **Tailwind CSS 4** - Utility-first CSS framework
- **shadcn/ui** - Beautiful and accessible components
- **Radix UI** - Low-level accessible primitives
- **Vite** - Lightning-fast build tool
- **Ollama** - Local AI model runtime

## 🚀 Getting Started

### Prerequisites

1. **Install Ollama** - Download from [ollama.ai](https://ollama.ai/download)
2. **Download Models** - Pull AI models using:
   ```bash
   ollama pull gemma2:1b
   ollama pull llama2
   ```

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chaichat
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start the development server**
   ```bash
   pnpm dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

### Building for Production

```bash
pnpm build
```

## 🎨 Design System

This project uses a custom shadcn/ui setup with:

- **Color System** - CSS variables for light/dark mode support
- **Typography** - Consistent font scales and spacing
- **Components** - Reusable, accessible components
- **Icons** - Lucide React icons throughout

### Note on shadcn/ui Setup

[[memory:2729487]] In this project's UI code (components and Tailwind config), we manually set up the core shadcn-ui building blocks (Button, Textarea, cn helper, Tailwind plugins, etc.) instead of using the shadcn-ui CLI, because the CLI is opinionated for Next.js/app-router and the project is a Vite+TanStack Router SPA.

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/           # shadcn/ui components
│   ├── ChatInput.tsx
│   ├── ChatMessage.tsx
│   └── ModelSelector.tsx
├── hooks/
│   └── useChat.ts
├── routes/
│   ├── __root.tsx
│   ├── index.tsx
│   └── about.tsx
├── services/
│   └── ollama.ts
├── types/
│   └── ollama.ts
└── lib/
    └── utils.ts
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) - For making local AI accessible
- [shadcn/ui](https://ui.shadcn.com) - For the beautiful component library
- [Radix UI](https://radix-ui.com) - For accessible primitives
- [Tailwind CSS](https://tailwindcss.com) - For the styling system

## Development

Run the React frontend and Express API together:

```sh
npm install
npm run dev
```

The frontend will start at the default Vite port (usually http://localhost:5173) and the API will run on http://localhost:3001.
