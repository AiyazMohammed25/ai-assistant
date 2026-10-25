import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import Chat from "@/models/Chat";
import dbConnect from "@/utils/dbConnect";
import {
  generateAndStoreImage,
  ImageGenerationError,
  removeGeneratedImage,
} from "@/utils/generatePollinationsImage";

const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let email: string | undefined;
  let assetId: string | undefined;
  try {
    const session = await getServerSession(authOptions);
    email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Sign in to generate an image." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const prompt = payload.prompt;
    const chatId = payload.chatId;
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000) {
      return NextResponse.json({ error: "Image prompt must contain between 1 and 1,000 characters." }, { status: 400 });
    }
    if (typeof chatId !== "string" || !sessionIdPattern.test(chatId)) {
      return NextResponse.json({ error: "A valid chat ID is required." }, { status: 400 });
    }

    await dbConnect();
    const generated = await generateAndStoreImage({
      prompt,
      ownerEmail: email,
      chatId,
    });
    assetId = generated.assetId;
    const displayPrompt = `Created an image for: ${prompt.trim()}`;
    try {
      await Chat.findOneAndUpdate(
        { userEmail: email, sessionId: chatId },
        {
          $setOnInsert: {
            userEmail: email,
            sessionId: chatId,
            title: prompt.trim().replace(/\s+/g, " ").slice(0, 72),
          },
          $push: {
            messages: {
              $each: [
                { role: "user", content: prompt.trim() },
                { role: "assistant", content: displayPrompt, imageUrl: generated.imageUrl },
              ],
              $slice: -100,
            },
          },
        },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      await removeGeneratedImage(generated.assetId, email);
      assetId = undefined;
      throw error;
    }
    return NextResponse.json({ chatId, imageUrl: generated.imageUrl });
  } catch (error) {
    console.error("Unable to generate and save image.", error);
    if (assetId && email) {
      await removeGeneratedImage(assetId, email).catch((cleanupError) => {
        console.error("Unable to remove an unsaved image asset.", cleanupError);
      });
    }
    if (error instanceof ImageGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to generate the image. Check server configuration and try again." }, { status: 500 });
  }
}
