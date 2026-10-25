import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import Chat, { type ChatMessage } from "@/models/Chat";
import dbConnect from "@/utils/dbConnect";
import { getImagePrompt } from "@/utils/pollinations";
import {
  generateAndStoreImage,
  ImageGenerationError,
  removeGeneratedImage,
} from "@/utils/generatePollinationsImage";

const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const liveSearchPattern =
  /\b(latest|current|today|yesterday|tomorrow|right now|this week|this month|this year|recent|news|weather|stock price|score|who is the (current|latest))\b/i;

type GroqStreamChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
};

type IncomingAttachment = {
  name: string;
  type: string;
  text?: string;
  dataUrl?: string;
};

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

type TavilyResponse = {
  results?: Array<{ title?: string; url?: string; content?: string }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function getAuthenticatedEmail() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.trim().toLowerCase() ?? null;
}

export async function GET(request: Request) {
  try {
    const email = await getAuthenticatedEmail();
    if (!email) {
      return jsonError("Sign in to access your chats.", 401);
    }

    await dbConnect();
    const chatId = new URL(request.url).searchParams.get("chatId");

    if (chatId) {
      if (!sessionIdPattern.test(chatId)) {
        return jsonError("The requested chat ID is invalid.", 400);
      }

      const chat = await Chat.findOne({ userEmail: email, sessionId: chatId })
        .select("sessionId title messages createdAt updatedAt")
        .lean();

      if (!chat) {
        return jsonError("Chat not found.", 404);
      }

      return NextResponse.json({
        chat: {
          chatId: chat.sessionId,
          title: chat.title,
          messages: chat.messages.map((message) => {
            const displayMessage = { ...message };
            delete displayMessage.documentContext;
            return displayMessage;
          }),
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
        },
      });
    }

    const chats = await Chat.find({ userEmail: email })
      .select("sessionId title updatedAt")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      chats: chats.map((chat) => ({
        chatId: chat.sessionId,
        title: chat.title,
        updatedAt: chat.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Unable to load chats.", error);
    return jsonError("Unable to load chats. Check the server configuration and try again.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 12 * 1024 * 1024) {
      return jsonError("The request is larger than the 12 MB upload limit.", 413);
    }
    const email = await getAuthenticatedEmail();
    if (!email) {
      return jsonError("Sign in to send a message.", 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Request body must be a JSON object.", 400);
    }

    const payload = body as Record<string, unknown>;
    const { chatId, prompt, webSearch, attachments: rawAttachments } = payload;

    if (typeof chatId !== "string" || !sessionIdPattern.test(chatId)) {
      return jsonError("A valid chat ID is required.", 400);
    }
    if (prompt !== undefined && (typeof prompt !== "string" || prompt.length > 6000)) {
      return jsonError("Message must contain at most 6,000 characters.", 400);
    }
    if (webSearch !== undefined && typeof webSearch !== "boolean") {
      return jsonError("webSearch must be a boolean.", 400);
    }
    if (rawAttachments !== undefined && (!Array.isArray(rawAttachments) || rawAttachments.length > 6)) {
      return jsonError("Attach up to 6 files per message.", 400);
    }
    const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : "";
    const incomingAttachments: IncomingAttachment[] = [];
    let attachmentTextLength = 0;
    let imagePayloadLength = 0;
    let imageAttachmentCount = 0;
    for (const value of (rawAttachments ?? []) as unknown[]) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return jsonError("An attachment is malformed.", 400);
      }
      const item = value as Record<string, unknown>;
      if (typeof item.name !== "string" || typeof item.type !== "string") {
        return jsonError("An attachment is missing its name or type.", 400);
      }
      const name = item.name.replace(/[\r\n\u0000]/g, "").slice(0, 160);
      const type = item.type.toLowerCase();
      if (type.startsWith("image/")) {
        imageAttachmentCount += 1;
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type) ||
          typeof item.dataUrl !== "string" ||
          !item.dataUrl.startsWith(`data:${type};base64,`) ||
          item.dataUrl.length > 4_200_000) {
          return jsonError("An image attachment is invalid or exceeds the 3 MB limit.", 400);
        }
        imagePayloadLength += item.dataUrl.length;
        if (imageAttachmentCount > 3 || imagePayloadLength > 10_800_000) {
          return jsonError("Attach up to 3 images, with 8 MB total upload size.", 400);
        }
        incomingAttachments.push({ name, type, dataUrl: item.dataUrl });
        continue;
      }
      if (!["application/pdf", "text/plain", "text/markdown", "text/csv", "application/json"].includes(type) ||
        typeof item.text !== "string") {
        return jsonError("Only PDF, text, and supported image files can be attached.", 400);
      }
      attachmentTextLength += item.text.length;
      if (item.text.length > 24_000 || attachmentTextLength > 40_000) {
        return jsonError("The attached documents contain too much text. Please attach shorter files.", 400);
      }
      incomingAttachments.push({ name, type, text: item.text });
    }
    if (!normalizedPrompt && incomingAttachments.length === 0) {
      return jsonError("Enter a message or attach a file.", 400);
    }

    const imagePrompt = incomingAttachments.length === 0
      ? getImagePrompt(normalizedPrompt)
      : null;
    if (imagePrompt) {
      await dbConnect();
      const generated = await generateAndStoreImage({
        prompt: imagePrompt,
        ownerEmail: email,
        chatId,
      });
      const title = normalizedPrompt.replace(/\s+/g, " ").slice(0, 72);
      const imageMessages: ChatMessage[] = [
        { role: "user", content: normalizedPrompt },
        {
          role: "assistant",
          content: `Created an image for: ${imagePrompt}`,
          imageUrl: generated.imageUrl,
        },
      ];
      try {
        await Chat.findOneAndUpdate(
          { userEmail: email, sessionId: chatId },
          {
            $setOnInsert: { userEmail: email, sessionId: chatId, title },
            $push: { messages: { $each: imageMessages, $slice: -100 } },
          },
          { upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
      } catch (error) {
        await removeGeneratedImage(generated.assetId, email);
        throw error;
      }
      return NextResponse.json({
        chatId,
        answer: `Created an image for: ${imagePrompt}`,
        imageUrl: generated.imageUrl,
        sources: [],
      });
    }

    const groqApiKey = process.env.GROQ_API_KEY?.trim();
    if (!groqApiKey) {
      return jsonError("GROQ_API_KEY is not configured on the server.", 503);
    }
    const groqModel = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;

    const shouldSearch = webSearch === true || liveSearchPattern.test(normalizedPrompt);
    let searchContext = "";
    let sources: Array<{ title: string; url: string }> = [];

    if (shouldSearch) {
      const tavilyApiKey = process.env.TAVILY_API_KEY;
      if (!tavilyApiKey) {
        return jsonError(
          "Live search is needed for this question, but TAVILY_API_KEY is not configured.",
          503,
        );
      }

      let searchResponse: Response;
      try {
        searchResponse = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: tavilyApiKey,
            query: normalizedPrompt,
            search_depth: "basic",
            include_answer: true,
            max_results: 5,
          }),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
      } catch (error) {
        console.error("Unable to reach Tavily.", error);
        if (error instanceof Error && error.name === "TimeoutError") {
          return jsonError("Live web search timed out. Please try again.", 504);
        }
        return jsonError(
          "Could not connect to live web search. Check the server's network connection and try again.",
          502,
        );
      }

      if (!searchResponse.ok) {
        console.error("Tavily search failed with status:", searchResponse.status);
        return jsonError("Live web search failed. Please try again shortly.", 502);
      }

      let searchData: TavilyResponse & { answer?: string };
      try {
        searchData = (await searchResponse.json()) as TavilyResponse & {
          answer?: string;
        };
      } catch (error) {
        console.error("Tavily returned an unreadable response.", error);
        return jsonError("Live web search returned an invalid response.", 502);
      }
      const results = (searchData.results ?? []).filter(
        (result) => result.url && result.content,
      );
      sources = results.map((result) => ({
        title: result.title || result.url || "Web result",
        url: result.url as string,
      }));
      searchContext = [
        searchData.answer ? `Search summary: ${searchData.answer}` : "",
        ...results.map(
          (result, index) =>
            `[${index + 1}] ${result.title ?? "Web result"} (${result.url})\n${result.content}`,
        ),
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    await dbConnect();

    const existingChat = await Chat.findOne({
      userEmail: email,
      sessionId: chatId,
    })
      .select("messages")
      .lean();
    const recentMessages = (existingChat?.messages ?? []).slice(-20);

    const attachedText = incomingAttachments
      .filter((attachment) => attachment.text)
      .map((attachment) => `\n\n--- Attached file: ${attachment.name} ---\n${attachment.text}`)
      .join("");
    const userPrompt = normalizedPrompt || "Please analyze the attached file(s).";
    const creatorContext =
      "Cybertron was created by Mohammad Aiyaz, whose nickname is Cybertron. If asked who created, built, or owns Cybertron, answer that Mohammad Aiyaz created it; you may mention that his nickname is Cybertron. Do not claim that the assistant itself created the project. ";
    const systemMessage = {
      role: "system",
      content: searchContext
        ? `You are Cybertron, a helpful AI assistant. ${creatorContext}Answer clearly and accurately. Use the live web search context below for current facts. If the context does not support an answer, say so. Cite sources inline using their [number].\n\n${searchContext}`
        : `You are Cybertron, a helpful AI assistant. ${creatorContext}Answer clearly and accurately. Be concise unless the user asks for detail.`,
    };

    const imageAttachments = incomingAttachments.filter(
      (attachment): attachment is IncomingAttachment & { dataUrl: string } => Boolean(attachment.dataUrl),
    );
    const selectedGroqModel = imageAttachments.length
      ? process.env.GROQ_VISION_MODEL?.trim() || "qwen/qwen3.8-27b"
      : groqModel;
    const currentUserContent = imageAttachments.length
      ? [
          { type: "text", text: `${userPrompt}${attachedText}` },
          ...imageAttachments.map((attachment) => ({
            type: "image_url",
            image_url: { url: attachment.dataUrl },
          })),
        ]
      : `${userPrompt}${attachedText}`;

    let groqResponse: Response;
    try {
      groqResponse = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedGroqModel,
            messages: [
              systemMessage,
              ...recentMessages.map((message) => ({
                role: message.role,
                content: message.documentContext
                  ? `${message.content}${message.documentContext}`
                  : message.content,
              })),
              { role: "user", content: currentUserContent },
            ],
            temperature: 0.6,
            max_completion_tokens: 2048,
            stream: true,
          }),
          signal: AbortSignal.timeout(60_000),
          cache: "no-store",
        },
      );
    } catch (error) {
      console.error("Unable to reach Groq.", error);
      if (error instanceof Error && error.name === "TimeoutError") {
        return jsonError("The AI request timed out. Please try again.", 504);
      }
      return jsonError(
        "Could not connect to the AI service. Check the server's network connection and try again.",
        502,
      );
    }

    if (!groqResponse.ok) {
      console.error("Groq completion failed with status:", groqResponse.status);
      if (groqResponse.status === 400 || groqResponse.status === 404) {
        return jsonError(
          `Groq rejected model "${selectedGroqModel}". Check GROQ_MODEL or GROQ_VISION_MODEL for a model available to your account.`,
          502,
        );
      }
      if (groqResponse.status === 401 || groqResponse.status === 403) {
        return jsonError(
          "Groq rejected the API key. Verify GROQ_API_KEY in the server environment.",
          502,
        );
      }
      if (groqResponse.status === 429) {
        return jsonError("The AI service is rate limited. Please wait and try again.", 503);
      }
      if (groqResponse.status >= 500) {
        return jsonError("The AI service is temporarily unavailable. Please try again.", 503);
      }
      return jsonError(
        `The AI service rejected the request (HTTP ${groqResponse.status}). Please try again.`,
        502,
      );
    }

    const title = (normalizedPrompt || incomingAttachments[0]?.name || "New conversation")
      .replace(/\s+/g, " ").slice(0, 72);
    let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let streamCancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const reader = groqResponse.body?.getReader();
        upstreamReader = reader;
        const emit = (event: Record<string, unknown>) => {
          if (streamCancelled) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        if (!reader) {
          emit({ type: "error", error: "The AI service returned an empty stream." });
          if (!streamCancelled) controller.close();
          return;
        }

        let answer = "";
        let pending = "";
        const decoder = new TextDecoder();
        const consumeLine = (line: string) => {
          if (!line.startsWith("data:")) return false;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return true;
          try {
            const chunk = JSON.parse(payload) as GroqStreamChunk;
            const token = chunk.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token) {
              answer += token;
              emit({ type: "token", token });
            }
          } catch (error) {
            console.error("Groq sent an invalid stream chunk.", error);
          }
          return false;
        };

        try {
          let finished = false;
          while (!finished) {
            const { done, value } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() ?? "";
            for (const line of lines) {
              if (consumeLine(line)) {
                finished = true;
                break;
              }
            }
          }
          pending += decoder.decode();
          if (pending.trim()) consumeLine(pending);
          if (streamCancelled) return;
          if (!answer.trim()) {
            throw new Error("The AI service returned an empty response.");
          }

          const messages: ChatMessage[] = [
            {
              role: "user",
              content: userPrompt,
              documentContext: attachedText || undefined,
              attachments: incomingAttachments.map(({ name, type }) => ({ name, type })),
            },
            { role: "assistant", content: answer.trim() },
          ];
          await Chat.findOneAndUpdate(
            { userEmail: email, sessionId: chatId },
            {
              $setOnInsert: { userEmail: email, sessionId: chatId, title },
              $push: { messages: { $each: messages, $slice: -100 } },
            },
            { upsert: true, runValidators: true, setDefaultsOnInsert: true },
          );
          emit({ type: "sources", sources });
          emit({ type: "done" });
        } catch (error) {
          console.error("Groq stream or chat persistence failed.", error);
          emit({
            type: "error",
            error: error instanceof Error && error.message.includes("empty response")
              ? error.message
              : "The AI response could not be completed or saved. Please retry.",
          });
        } finally {
          reader.releaseLock();
          if (!streamCancelled) controller.close();
        }
      },
      cancel(reason) {
        streamCancelled = true;
        return upstreamReader?.cancel(reason);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Unable to process chat request.", error);
    if (error instanceof ImageGenerationError) {
      return jsonError(error.message, error.status);
    }
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The request timed out. Please try again."
        : "Unable to process your message. Check the server configuration and try again.";
    return jsonError(message, 500);
  }
}
