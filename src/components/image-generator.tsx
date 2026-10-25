"use client";

import { Download, ImagePlus, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

type ImageGeneratorProps = {
  chatId: string | null;
  onClose: () => void;
  onGenerated: (prompt: string, imageUrl: string, chatId: string) => void;
};

export default function ImageGenerator({ chatId, onClose, onGenerated }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;
    setLoading(true);
    setError("");
    try {
      const activeChatId = chatId ?? crypto.randomUUID();
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, chatId: activeChatId }),
      });
      const body = (await response.json()) as { imageUrl?: string; error?: string };
      if (!response.ok || !body.imageUrl) {
        throw new Error(body.error || "Image generation failed. Please try again.");
      }
      setImageUrl(body.imageUrl);
      onGenerated(cleanPrompt, body.imageUrl, activeChatId);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Image generation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="image-generator-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="image-generator" role="dialog" aria-modal="true" aria-labelledby="image-generator-title">
        <header className="image-generator-header">
          <div><span className="tool-option-icon tool-image-icon"><ImagePlus size={17} /></span><div><h2 id="image-generator-title">Image workspace</h2><p>Turn a description into an image</p></div></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close image workspace"><X size={18} /></button>
        </header>
        <form className="image-generator-form" onSubmit={generate}>
          <label htmlFor="image-prompt">Describe the image</label>
          <textarea id="image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1000} rows={3} placeholder="A luminous city in the clouds at twilight…" />
          <div className="image-generator-actions">
            <span>{prompt.length}/1000</span>
            <button className="image-generate-button" type="submit" disabled={!prompt.trim() || loading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />}
              {loading ? "Creating…" : "Generate image"}
            </button>
          </div>
        </form>
        {error && <p className="image-generator-error" role="alert">{error}</p>}
        {imageUrl ? (
          <div className="image-generator-result">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={prompt} />
            <a href={imageUrl} download target="_blank" rel="noreferrer"><Download size={15} />Open or save image</a>
          </div>
        ) : (
          <div className="image-generator-empty"><ImagePlus size={24} /><span>Your generated image will appear here.</span></div>
        )}
      </section>
    </div>
  );
}
