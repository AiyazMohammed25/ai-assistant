"use client";

import { ArrowDown, Check, Globe2, Menu, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VoiceControls from "@/components/voice-controls";
import type { ChatMessage } from "@/types/chat";

type ChatWindowProps = {
  title: string;
  messages: ChatMessage[];
  loading: boolean;
  onOpenSidebar: () => void;
  onCopy: (content: string, index: number) => void;
  error: string;
  onDismissError: () => void;
  onSuggestion: (value: string) => void;
  composer: ReactNode;
};

export default function ChatWindow({
  title,
  messages,
  loading,
  onOpenSidebar,
  onCopy,
  error,
  onDismissError,
  onSuggestion,
  composer,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [scrolledAway, setScrolledAway] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);

  useEffect(() => {
    if (!scrolledAway) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, scrolledAway]);

  const handleCopy = async (content: string, index: number) => {
    await onCopy(content, index);
    setCopiedMessage(index);
    window.setTimeout(() => setCopiedMessage(null), 1400);
  };

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setScrolledAway(
      element.scrollHeight - element.scrollTop - element.clientHeight > 140,
    );
  };

  return (
    <section className="chat-shell">
      <header className="topbar">
        <div className="topbar-start">
          <button
            className="icon-button mobile-menu-button"
            type="button"
            aria-label="Open navigation"
            onClick={onOpenSidebar}
          >
            <Menu size={19} />
          </button>
          <span className="topbar-context">Your space</span>
          <span className="topbar-divider">/</span>
          <span className="topbar-current">{title}</span>
        </div>
        <div className="topbar-status">
          <span className="status-dot" />
          <span>Ready when you are</span>
        </div>
      </header>

      <section
        className="conversation-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-orbit">
              <div className="welcome-orbit-ring" />
              <div className="welcome-orbit-core">
                <Sparkles size={25} />
              </div>
              <span className="welcome-orbit-star welcome-star-one">✳</span>
              <span className="welcome-orbit-star welcome-star-two">✦</span>
            </div>
            <span className="welcome-kicker">A little space to think</span>
            <h1>
              What&apos;s on
              <br />
              <span>your mind?</span>
            </h1>
            <p>
              Ask anything, explore an idea, or just start somewhere.
              <br className="desktop-break" /> We&apos;ll figure it out together.
            </p>
            <div className="suggestion-row">
              {[
                "Help me think through an idea",
                "Explain something simply",
                "Find a fresh perspective",
              ].map((suggestion, index) => (
                <button
                  className="suggestion-chip"
                  key={suggestion}
                  type="button"
                  onClick={() => onSuggestion(suggestion)}
                >
                  {index === 0 && <Sparkles size={13} />}
                  {index === 1 && <Search size={13} />}
                  {index === 2 && <Globe2 size={13} />}
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message, index) => (
              <article
                className={`message-row ${message.role === "user" ? "message-row-user" : "message-row-assistant"}`}
                key={`${message.role}-${index}`}
              >
                {message.role === "assistant" && (
                  <div className="message-avatar">
                    <Sparkles size={14} />
                  </div>
                )}
                <div className="message-body">
                  <div className="message-label">
                    {message.role === "user" ? "You" : "Cybertron"}
                  </div>
                  <div className="message-content markdown-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ ...props }) => (
                          <a {...props} target="_blank" rel="noreferrer" />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {!!message.attachments?.length && (
                    <div className="attachment-chips" aria-label="Attachments">
                      {message.attachments.map((attachment) => (
                        <span
                          className="attachment-chip"
                          key={`${attachment.name}-${attachment.type}`}
                        >
                          {attachment.type.startsWith("image/") ? "Image" : "File"}: {attachment.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {message.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="generated-image"
                      src={message.imageUrl}
                      alt={message.content}
                      loading="lazy"
                    />
                  )}
                  {!!message.sources?.length && (
                    <div className="sources">
                      <div className="sources-title">
                        <Globe2 size={13} />
                        <span>Sources</span>
                      </div>
                      <div className="sources-list">
                        {message.sources.map((source, sourceIndex) => (
                          <a
                            className="source-link"
                            href={source.url}
                            key={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span>{sourceIndex + 1}</span>
                            {source.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {message.role === "assistant" && !!message.content.trim() && (
                    <div className="message-actions">
                      {!loading && <VoiceControls text={message.content} />}
                      <button
                        className="copy-message"
                        type="button"
                        onClick={() => void handleCopy(message.content, index)}
                      >
                        {copiedMessage === index ? (
                          <Check size={13} />
                        ) : (
                          <span className="copy-icon">▢</span>
                        )}
                        {copiedMessage === index ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
            {loading && (
              <div className="thinking-row">
                <div className="message-avatar">
                  <Sparkles size={14} />
                </div>
                <span className="thinking-dots"><i /><i /><i /></span>
                <span>Thinking…</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Dismiss error" onClick={onDismissError}>
              <X size={15} />
            </button>
          </div>
        )}
      </section>

      {scrolledAway && (
        <button
          className="scroll-bottom-button"
          type="button"
          onClick={() => {
            setScrolledAway(false);
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }}
        >
          <ArrowDown size={15} />
          Newest message
        </button>
      )}
      {composer}
    </section>
  );
}
