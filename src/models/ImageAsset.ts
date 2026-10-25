import { model, models, Schema, type Document, type Model } from "mongoose";

export interface ImageAssetRecord extends Document {
  ownerEmail: string;
  chatId: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  data: Buffer;
  createdAt: Date;
}

const imageAssetSchema = new Schema<ImageAssetRecord>(
  {
    ownerEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    chatId: { type: String, required: true, trim: true, index: true },
    contentType: {
      type: String,
      enum: ["image/png", "image/jpeg", "image/webp"],
      required: true,
    },
    data: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const ImageAsset =
  (models.ImageAsset as Model<ImageAssetRecord> | undefined) ??
  model<ImageAssetRecord>("ImageAsset", imageAssetSchema);

export default ImageAsset;
