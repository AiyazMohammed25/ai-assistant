import { getServerSession } from "next-auth";
import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import ImageAsset from "@/models/ImageAsset";
import dbConnect from "@/utils/dbConnect";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Sign in to view this image." }, { status: 401 });
    }

    const { assetId } = await params;
    if (!isValidObjectId(assetId)) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    await dbConnect();
    const asset = await ImageAsset.findOne({ _id: assetId, ownerEmail: email })
      .select("contentType data");
    if (!asset) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    const image = new Uint8Array(asset.data);
    return new Response(image, {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(image.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load generated image.", error);
    return NextResponse.json({ error: "Unable to load this image." }, { status: 500 });
  }
}
