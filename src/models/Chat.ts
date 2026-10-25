import { model, models, Schema, type Document, type Model } from "mongoose";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  documentContext?: string;
  imageUrl?: string;
  attachments?: Array<{ name: string; type: string }>;
}

export interface ChatRecord extends Document {
  userEmail: string;
  sessionId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<ChatMessage>(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 12000,
    },
    documentContext: { type: String, maxlength: 40000 },
    imageUrl: { type: String, maxlength: 16000 },
    attachments: {
      type: [{
        name: { type: String, required: true, maxlength: 160 },
        type: { type: String, required: true, maxlength: 100 },
      }],
      default: undefined,
    },
  },
  { _id: false },
);

const chatSchema = new Schema<ChatRecord>(
  {
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    sessionId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  { timestamps: true },
);

chatSchema.index({ userEmail: 1, sessionId: 1 }, { unique: true });
chatSchema.index({ userEmail: 1, updatedAt: -1 });

const Chat =
  (models.Chat as Model<ChatRecord> | undefined) ??
  model<ChatRecord>("Chat", chatSchema);

export default Chat;
