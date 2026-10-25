# Cybertron AI Assistant

A private, Google-authenticated AI workspace built with the Next.js App Router. Cybertron combines streamed Groq chat and vision, optional Tavily-grounded web search, MongoDB conversation history, browser speech input and playback, PDF/text/image attachments, live markdown rendering, and Pollinations image generation.

## Requirements

- Node.js 20 or later
- MongoDB connection string
- Google OAuth web application credentials
- Groq API key
- Tavily API key for live web search

## Configure environment

Create a `.env.local` file in the project root:

```dotenv
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://...
GROQ_API_KEY=your-groq-api-key
TAVILY_API_KEY=your-tavily-api-key
POLLINATIONS_API_KEY=your-pollinations-server-key
# Optional. Defaults to openai/gpt-oss-120b for text and qwen/qwen3.8-27b for image questions.
GROQ_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=qwen/qwen3.8-27b
# Optional image model supported by Pollinations.
POLLINATIONS_IMAGE_MODEL=black-forest-labs/flux.1-schnell
```

Set the Google OAuth authorized redirect URI to `http://localhost:3000/api/auth/callback/google` for local development. In production, set `NEXTAUTH_URL` and the Google redirect URI to your deployed HTTPS origin. Keep all credentials server-side and out of source control.

Google sign-in requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET`. Chat responses require `MONGODB_URI` and `GROQ_API_KEY`. The Tavily key is required when live search is enabled or a question appears to need current information. Pollinations image generation requires a server-side `POLLINATIONS_API_KEY` and available account credits; generated image bytes are checked and stored privately in MongoDB before the chat returns success. PDF uploads extract selectable text in the browser; scanned PDFs need OCR first. Image questions use a Groq vision-capable model. The public `pdf.worker.min.mjs` file must match the installed `pdfjs-dist` package when upgrading that dependency.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Run `npm run lint` and `npm run build` to validate a production build.
