import "server-only";

import ImageAsset from "@/models/ImageAsset";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux.1-schnell";
type PollinationsImageType = "image/png" | "image/jpeg" | "image/webp";

function isSupportedImageType(type: string): type is PollinationsImageType {
  return type === "image/png" || type === "image/jpeg" || type === "image/webp";
}

export class ImageGenerationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

function hasValidSignature(type: string, data: Buffer): boolean {
  if (type === "image/png") {
    return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (type === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (type === "image/webp") {
    return data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

export async function generateAndStoreImage({
  prompt,
  ownerEmail,
  chatId,
}: {
  prompt: string;
  ownerEmail: string;
  chatId: string;
}): Promise<{ imageUrl: string; assetId: string }> {
  const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
  if (!apiKey) {
    throw new ImageGenerationError(
      "Image generation is not configured. Add POLLINATIONS_API_KEY to the server environment.",
      503,
    );
  }

  const endpoint = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt.trim())}`);
  endpoint.searchParams.set("model", process.env.POLLINATIONS_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL);
  endpoint.searchParams.set("width", "1024");
  endpoint.searchParams.set("height", "1024");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "image/png,image/jpeg,image/webp" },
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ImageGenerationError("Pollinations image generation timed out. Please retry.", 504);
    }
    console.error("Could not reach Pollinations image generation.", error);
    throw new ImageGenerationError("Could not connect to Pollinations. Check the server network and retry.", 502);
  }

  if (!response.ok) {
    console.error("Pollinations image request failed with status:", response.status);
    if (response.status === 401 || response.status === 403) {
      throw new ImageGenerationError("Pollinations rejected POLLINATIONS_API_KEY. Verify the server key.", 502);
    }
    if (response.status === 402) {
      throw new ImageGenerationError("The Pollinations account has insufficient image-generation credits.", 503);
    }
    if (response.status === 429) {
      throw new ImageGenerationError("Pollinations is rate limiting image requests. Please wait and retry.", 503);
    }
    throw new ImageGenerationError("Pollinations could not generate this image. Please revise the prompt and retry.", 502);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!isSupportedImageType(contentType)) {
    throw new ImageGenerationError("Pollinations returned a non-image response; no image was saved.", 502);
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new ImageGenerationError("The generated image exceeds the 12 MB storage limit.", 502);
  }

  const imageData = Buffer.from(await response.arrayBuffer());
  if (imageData.length === 0 || imageData.length > MAX_IMAGE_BYTES || !hasValidSignature(contentType, imageData)) {
    throw new ImageGenerationError("Pollinations returned invalid or oversized image data; no image was saved.", 502);
  }

  const asset = await ImageAsset.create({ ownerEmail, chatId, contentType, data: imageData });
  return { assetId: asset.id, imageUrl: `/api/image/assets/${asset.id}` };
}

export async function removeGeneratedImage(assetId: string, ownerEmail: string): Promise<void> {
  await ImageAsset.deleteOne({ _id: assetId, ownerEmail });
}
