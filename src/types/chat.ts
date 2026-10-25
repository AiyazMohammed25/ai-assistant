export type Source = {
  title: string;
  url: string;
};

export type AttachmentSummary = {
  name: string;
  type: string;
};

export type AttachmentPayload = AttachmentSummary & {
  text?: string;
  dataUrl?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  clientId?: string;
  sources?: Source[];
  imageUrl?: string;
  attachments?: AttachmentSummary[];
};

export type ChatSummary = {
  chatId: string;
  title: string;
  updatedAt: string;
};
