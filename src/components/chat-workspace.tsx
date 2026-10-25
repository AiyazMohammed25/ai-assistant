"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "next-auth";
import ChatInput from "@/components/chat-input";
import ChatWindow from "@/components/chat-window";
import ImageGenerator from "@/components/image-generator";
import PdfGenerator from "@/components/pdf-generator";
import Sidebar from "@/components/sidebar";
import type {
  AttachmentPayload,
  ChatMessage,
  ChatSummary,
  Source,
} from "@/types/chat";

type ChatWorkspaceProps = {
  user: NonNullable<Session["user"]>;
};

async function responseJson<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  let data: (T & { error?: string }) | undefined;
  try {
    data = JSON.parse(responseText) as T & { error?: string };
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (HTTP ${response.status}). Please try again.`);
  }
  if (!data) throw new Error("The server returned an unreadable response. Please try again.");
  return data;
}

export default function ChatWorkspace({ user }: ChatWorkspaceProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [error, setError] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [listVisible, setListVisible] = useState(true);
  const [imageGeneratorOpen, setImageGeneratorOpen] = useState(false);
  const [pdfGeneratorOpen, setPdfGeneratorOpen] = useState(false);

  const loadChats = useCallback(async () => {
    const response = await fetch("/api/chat", { cache: "no-store" });
    const data = await responseJson<{ chats: ChatSummary[] }>(response);
    setChats(data.chats);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/chat", { cache: "no-store" })
      .then((response) => responseJson<{ chats: ChatSummary[] }>(response))
      .then((data) => {
        if (active) setChats(data.chats);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load your chat history.");
      })
      .finally(() => {
        if (active) setLoadingChats(false);
      });
    return () => { active = false; };
  }, []);

  const startNewChat = () => {
    setChatId(null);
    setMessages([]);
    setDraft("");
    setError("");
    setWebSearch(false);
    setSidebarOpen(false);
  };

  const openChat = async (selectedChatId: string) => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/chat?chatId=${encodeURIComponent(selectedChatId)}`, { cache: "no-store" });
      const data = await responseJson<{ chat: { chatId: string; messages: ChatMessage[] } }>(response);
      setChatId(data.chat.chatId);
      setMessages(data.chat.messages);
      setSidebarOpen(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to open this conversation.");
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (prompt: string, attachments: AttachmentPayload[]) => {
    if ((!prompt.trim() && !attachments.length) || loading) return;
    const activeChatId = chatId ?? crypto.randomUUID();
    const displayPrompt = prompt.trim() || "Please analyze the attached file(s).";
    const userMessage: ChatMessage = {
      role: "user",
      content: displayPrompt,
      attachments: attachments.map(({ name, type }) => ({ name, type })),
    };
    setChatId(activeChatId);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setLoading(true);

    let assistantClientId: string | null = null;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeChatId, prompt, attachments, webSearch }),
      });
      if (!response.ok) {
        await responseJson<never>(response);
      }

      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("The AI stream could not be opened.");
        assistantClientId = crypto.randomUUID();
        setMessages((current) => [...current, {
          role: "assistant",
          content: "",
          clientId: assistantClientId ?? undefined,
        }]);

        const decoder = new TextDecoder();
        let pending = "";
        let streamError = "";
        const consumeLine = (line: string) => {
          if (!line.startsWith("data:")) return;
          try {
            const event = JSON.parse(line.slice(5).trim()) as {
              type?: string;
              token?: string;
              error?: string;
              sources?: Source[];
            };
            if (event.type === "token" && event.token) {
              const id = assistantClientId;
              setMessages((current) => current.map((message) =>
                message.clientId === id
                  ? { ...message, content: message.content + event.token }
                  : message,
              ));
            } else if (event.type === "sources") {
              const id = assistantClientId;
              setMessages((current) => current.map((message) =>
                message.clientId === id ? { ...message, sources: event.sources ?? [] } : message,
              ));
            } else if (event.type === "error") {
              streamError = event.error || "The AI response could not be completed.";
            }
          } catch {
            streamError = "The AI service returned an unreadable stream.";
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() ?? "";
            for (const line of lines) consumeLine(line);
          }
          pending += decoder.decode();
          if (pending.trim()) consumeLine(pending);
        } finally {
          reader.releaseLock();
        }
        if (streamError) throw new Error(streamError);
      } else {
        const data = await responseJson<{
          answer: string;
          sources: Source[];
          imageUrl?: string;
        }>(response);
        setMessages((current) => [...current, {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          imageUrl: data.imageUrl,
        }]);
      }
      void loadChats().catch((loadError: unknown) => {
        setError(loadError instanceof Error
          ? `Your reply was sent, but chat history could not refresh: ${loadError.message}`
          : "Your reply was sent, but chat history could not refresh.");
      });
    } catch (requestError) {
      setMessages((current) => current.filter((message) =>
        message !== userMessage && message.clientId !== assistantClientId,
      ));
      setDraft(prompt);
      throw requestError;
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      setError("Could not copy this message to the clipboard.");
      throw new Error("Could not copy this message to the clipboard.");
    }
  };

  const recordGeneratedImage = (prompt: string, imageUrl: string, activeChatId: string) => {
    setChatId(activeChatId);
    setMessages((current) => [
      ...current,
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: `Created an image for: ${prompt}`,
        imageUrl,
      },
    ]);
    void loadChats().catch(() => undefined);
  };

  const title = chatId
    ? chats.find((chat) => chat.chatId === chatId)?.title ?? "Conversation"
    : "New conversation";

  return (
    <main className="workspace">
      <Sidebar
        user={user}
        chats={chats}
        chatId={chatId}
        loadingChats={loadingChats}
        open={sidebarOpen}
        listVisible={listVisible}
        onToggleList={() => setListVisible((visible) => !visible)}
        onNewChat={startNewChat}
        onOpenChat={openChat}
        onClose={() => setSidebarOpen(false)}
      />
      <ChatWindow
        title={title}
        messages={messages}
        loading={loading}
        onOpenSidebar={() => setSidebarOpen(true)}
        onCopy={copyMessage}
        error={error}
        onDismissError={() => setError("")}
        onSuggestion={setDraft}
        composer={
          <ChatInput
            draft={draft}
            setDraft={setDraft}
            loading={loading}
            webSearch={webSearch}
            setWebSearch={setWebSearch}
            onSubmit={sendMessage}
            onError={setError}
            onOpenImageGenerator={() => setImageGeneratorOpen(true)}
            onOpenPdfGenerator={() => setPdfGeneratorOpen(true)}
          />
        }
      />
      {imageGeneratorOpen && (
        <ImageGenerator
          chatId={chatId}
          onClose={() => setImageGeneratorOpen(false)}
          onGenerated={recordGeneratedImage}
        />
      )}
      {pdfGeneratorOpen && <PdfGenerator onClose={() => setPdfGeneratorOpen(false)} />}
    </main>
  );
}
