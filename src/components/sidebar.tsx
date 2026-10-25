"use client";

import {
  ChevronDown,
  LoaderCircle,
  LogOut,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";
import type { ChatSummary } from "@/types/chat";

type SidebarProps = {
  user: NonNullable<Session["user"]>;
  chats: ChatSummary[];
  chatId: string | null;
  loadingChats: boolean;
  open: boolean;
  listVisible: boolean;
  onToggleList: () => void;
  onNewChat: () => void;
  onOpenChat: (chatId: string) => void;
  onClose: () => void;
};

export default function Sidebar({
  user,
  chats,
  chatId,
  loadingChats,
  open,
  listVisible,
  onToggleList,
  onNewChat,
  onOpenChat,
  onClose,
}: SidebarProps) {
  const fullName = user.name?.trim() || user.email || "Your account";
  const initials = fullName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return (
    <>
      {open && (
        <button
          className="mobile-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Link className="workspace-brand" href="/" aria-label="Cybertron home">
            <span className="workspace-brand-mark">
              <Sparkles size={17} strokeWidth={2.2} />
            </span>
            <span>Cybertron</span>
          </Link>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <button className="new-chat-button" type="button" onClick={onNewChat}>
          <SquarePen size={16} />
          <span>New conversation</span>
        </button>

        <div className="history-section">
          <div className="history-heading">
            <span>YOUR SPACE</span>
            <button
              className="history-toggle"
              type="button"
              aria-expanded={listVisible}
              onClick={onToggleList}
            >
              {chats.length || ""}
              <ChevronDown
                size={13}
                className={listVisible ? "chevron-turned" : ""}
              />
            </button>
          </div>
          {listVisible && (
            <div className="chat-history">
              {loadingChats ? (
                <div className="history-empty">
                  <LoaderCircle size={14} className="spin" />
                  <span>Loading conversations</span>
                </div>
              ) : chats.length === 0 ? (
                <div className="history-empty">
                  Your conversations will show up here.
                </div>
              ) : (
                chats.map((chat) => (
                  <button
                    className={`history-item ${chatId === chat.chatId ? "history-item-active" : ""}`}
                    key={chat.chatId}
                    type="button"
                    title={chat.title}
                    onClick={() => onOpenChat(chat.chatId)}
                  >
                    <span className="history-item-dot" />
                    <span>{chat.title}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <Sparkles size={14} />
            </span>
            <div>
              <strong>A space to think</strong>
              <span>Answers are a starting point.</span>
            </div>
          </div>
          <div className="account-row">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="avatar" src={user.image} alt="" />
            ) : (
              <span className="avatar avatar-fallback">{initials || "O"}</span>
            )}
            <div className="account-copy">
              <strong>{fullName}</strong>
              <span>{user.email}</span>
            </div>
            <button
              className="icon-button signout-button"
              type="button"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
