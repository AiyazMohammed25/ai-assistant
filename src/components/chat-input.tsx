"use client";

import {
  ArrowUp,
  Check,
  FileText,
  Globe2,
  ImagePlus,
  LoaderCircle,
  Mic,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/pdf";
import type { AttachmentPayload } from "@/types/chat";

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type ChatInputProps = {
  draft: string;
  setDraft: (value: string) => void;
  loading: boolean;
  webSearch: boolean;
  setWebSearch: (value: boolean | ((current: boolean) => boolean)) => void;
  onSubmit: (prompt: string, attachments: AttachmentPayload[]) => Promise<void>;
  onError: (message: string) => void;
  onOpenImageGenerator: () => void;
  onOpenPdfGenerator: () => void;
};

const MAX_FILES = 6;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_COUNT = 3;
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const ACCEPTED_TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);
const IMAGE_TYPES_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

function getImageType(file: File): string | null {
  const declaredType = file.type.toLowerCase().split(";")[0];
  if (declaredType.startsWith("image/")) return declaredType;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES_BY_EXTENSION[extension] ?? null;
}

function isImageFile(file: File): boolean {
  return getImageType(file) !== null;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not prepare this image for upload."));
    }, type, quality);
  });
}

async function prepareImage(file: File, name: string): Promise<AttachmentPayload> {
  const sourceType = getImageType(file);
  if (!sourceType) throw new Error(`${file.name} is not a supported image file.`);

  if (sourceType === "image/jpeg" && file.size <= MAX_IMAGE_BYTES) {
    return { name, type: sourceType, dataUrl: await readDataUrl(file) };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is larger than the 8 MB image limit.`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be decoded by this browser. Try PNG, JPEG, or WebP.`);
  }

  try {
    let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.86;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser could not prepare this image for upload.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
      canvas.width = 0;
      canvas.height = 0;
      if (blob.size <= MAX_IMAGE_BYTES) break;
      scale *= 0.78;
      quality = Math.max(0.58, quality - 0.08);
    }
    if (!blob || blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`${file.name} could not be reduced below the 2.5 MB upload limit.`);
    }
    const normalizedFile = new File([blob], name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
    return { name: normalizedFile.name, type: "image/jpeg", dataUrl: await readDataUrl(normalizedFile) };
  } finally {
    bitmap.close();
  }
}

async function renderPdfPages(document: PDFDocumentProxy, fileName: string): Promise<AttachmentPayload[]> {
  const pagesToRender = Math.min(document.numPages, MAX_IMAGE_COUNT);
  const images: AttachmentPayload[] = [];

  for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const initialViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.35, 1500 / Math.max(initialViewport.width, initialViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;

    let quality = 0.82;
    let blob = await canvasToBlob(canvas, "image/jpeg", quality);
    while (blob.size > MAX_IMAGE_BYTES && quality > 0.58) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }
    canvas.width = 0;
    canvas.height = 0;
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`PDF page ${pageNumber} is too large to attach safely.`);
    }
    const pageName = `${fileName.replace(/\.pdf$/i, "")}-page-${pageNumber}.jpg`;
    const imageFile = new File([blob], pageName, { type: "image/jpeg" });
    images.push({ name: imageFile.name, type: "image/jpeg", dataUrl: await readDataUrl(imageFile) });
  }

  return [
    {
      name: fileName,
      type: "text/plain",
      text: `This PDF has no selectable text. The first ${pagesToRender} of ${document.numPages} pages are attached as images for visual analysis.`,
    },
    ...images,
  ];
}

async function preparePdfAttachment(file: File, name: string): Promise<AttachmentPayload[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await loadingTask.promise;
    if (document.numPages > 40) {
      throw new Error(`${file.name} has more than 40 pages. Please choose a shorter PDF.`);
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    const text = pages.join("\n\n").trim();
    if (text) return [{ name, type: "application/pdf", text: text.slice(0, 24_000) }];
    const renderedPages = await renderPdfPages(document, name);
    return renderedPages;
  } finally {
    await loadingTask.destroy();
  }
}

async function prepareAttachment(file: File): Promise<AttachmentPayload[]> {
  const type = file.type.toLowerCase();
  const name = file.name.replace(/[\r\n\u0000]/g, "").slice(0, 160);

  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    return preparePdfAttachment(file, name);
  }
  if (isImageFile(file)) {
    return [await prepareImage(file, name)];
  }
  if (ACCEPTED_TEXT_TYPES.has(type) || /\.(txt|md|csv|json)$/i.test(name)) {
    const text = await file.text();
    return [{ name, type: type || "text/plain", text: text.slice(0, 24_000) }];
  }
  throw new Error(`${file.name} is unsupported. Attach a PDF, text file, or image.`);
}

export default function ChatInput({
  draft,
  setDraft,
  loading,
  webSearch,
  setWebSearch,
  onSubmit,
  onError,
  onOpenImageGenerator,
  onOpenPdfGenerator,
}: ChatInputProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef("");
  const busy = loading || preparing;
  const currentBytes = files.reduce((total, file) => total + file.size, 0);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.some((item) => item.name === file.name && item.size === file.size)) continue;
      if (next.length >= MAX_FILES) {
        onError(`You can attach up to ${MAX_FILES} files per message.`);
        break;
      }
      if (next.reduce((total, item) => total + item.size, 0) + file.size > MAX_UPLOAD_BYTES) {
        onError("Attachments must total 8 MB or less.");
        break;
      }
      if (isImageFile(file) && next.filter(isImageFile).length >= MAX_IMAGE_COUNT) {
        onError(`You can attach up to ${MAX_IMAGE_COUNT} images per message.`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if ((!prompt && files.length === 0) || busy) return;

    setPreparing(true);
    try {
      const attachments = (await Promise.all(files.map(prepareAttachment))).flat();
      if (attachments.length > MAX_FILES) {
        throw new Error("These files expand into too many pages or images. Attach fewer files.");
      }
      const imageAttachments = attachments.filter((attachment) => attachment.dataUrl);
      if (imageAttachments.length > MAX_IMAGE_COUNT) {
        throw new Error(`Attach up to ${MAX_IMAGE_COUNT} images or scanned PDF pages per message.`);
      }
      if (imageAttachments.reduce((total, attachment) => total + (attachment.dataUrl?.length ?? 0), 0) > 10_000_000) {
        throw new Error("Prepared images exceed the upload limit. Attach fewer or smaller images.");
      }
      const extractedTextLength = attachments.reduce(
        (total, attachment) => total + (attachment.text?.length ?? 0),
        0,
      );
      if (extractedTextLength > 40_000) {
        throw new Error("The selected documents contain too much text. Attach fewer or shorter files.");
      }
      await onSubmit(prompt, attachments);
      setFiles([]);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not prepare your attachments.");
    } finally {
      setPreparing(false);
    }
  };

  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError("Voice input is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    voiceBaseRef.current = draft.trimEnd();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("");
      const base = voiceBaseRef.current;
      setDraft(`${base}${base && transcript ? " " : ""}${transcript}`);
    };
    recognition.onerror = (event) => {
      onError(event.error === "not-allowed"
        ? "Allow microphone access in your browser to use voice input."
        : "Voice input stopped unexpectedly. Please try again.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      onError("Could not start voice input. Please try again.");
    }
  };

  return (
    <footer className="composer-area">
      <form className="composer" onSubmit={handleSubmit}>
        {!!files.length && (
          <div className="attachment-chips attachment-queue" aria-label="Selected files">
            {files.map((file) => (
              <span className="attachment-chip" key={`${file.name}-${file.size}`}>
                <FileText size={13} />
                {file.name}
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((items) => items.filter((item) => item !== file))}
                ><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {webSearch && (
          <div className="composer-mode composer-mode-search">
            <Globe2 size={13} /><span>Web search on</span>
            <button type="button" aria-label="Turn off web search" onClick={() => setWebSearch(false)}><X size={13} /></button>
          </div>
        )}
        <div className="composer-input-row">
          <div className="composer-tools-wrap">
            <button
              className={`composer-tool-button ${toolsOpen ? "composer-tool-active" : ""}`}
              type="button"
              title="Open tools"
              aria-label="Open tools"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((open) => !open)}
              disabled={busy}
            >{toolsOpen ? <X size={19} /> : <Plus size={19} />}</button>
            {toolsOpen && (
              <div className="tools-popover">
                <div className="tools-heading">TOOLS</div>
                <button className="tool-option" type="button" onClick={() => { setToolsOpen(false); fileRef.current?.click(); }}>
                  <span className="tool-option-icon tool-image-icon"><Paperclip size={16} /></span>
                  <span className="tool-option-copy"><strong>Add files</strong><span>PDF, text, and images (8 MB max)</span></span>
                </button>
                <button className="tool-option" type="button" onClick={() => setWebSearch((enabled) => !enabled)}>
                  <span className="tool-option-icon tool-search-icon"><Globe2 size={16} /></span>
                  <span className="tool-option-copy"><strong>Web search</strong><span>Ground answers in live sources</span></span>
                  <span className={`tool-switch ${webSearch ? "tool-switch-on" : ""}`}><i /></span>
                </button>
                <button className="tool-option" type="button" onClick={() => { setToolsOpen(false); onOpenImageGenerator(); }}>
                  <span className="tool-option-icon tool-image-icon"><ImagePlus size={16} /></span>
                  <span className="tool-option-copy"><strong>Create an image</strong><span>Open the image workspace</span></span>
                  <Check size={15} />
                </button>
                <button className="tool-option" type="button" onClick={() => { setToolsOpen(false); onOpenPdfGenerator(); }}>
                  <span className="tool-option-icon tool-search-icon"><FileText size={16} /></span>
                  <span className="tool-option-copy"><strong>Create a PDF</strong><span>Paste text and download a PDF</span></span>
                  <Check size={15} />
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              multiple
              accept=".pdf,.txt,.md,.csv,.json,image/*"
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            placeholder="Ask anything, or share what you’re thinking…"
            aria-label="Message"
            rows={1}
            value={draft}
            disabled={busy}
            onChange={(event) => {
              setDraft(event.target.value);
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className={`mic-button ${listening ? "mic-button-active" : ""}`}
            type="button"
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            title={listening ? "Stop voice input" : "Voice input"}
            onClick={toggleVoiceInput}
            disabled={busy}
          ><Mic size={17} /></button>
          <button className="send-button" type="submit" aria-label="Send message" disabled={(!draft.trim() && !files.length) || busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} strokeWidth={2.4} />}
          </button>
        </div>
        <div className="composer-hint">
          <span>{preparing ? "Reading attachments…" : listening ? "Listening…" : "Cybertron can make mistakes. Explore what matters."}</span>
          <span><kbd>↵</kbd> send <kbd>⇧ ↵</kbd> new line</span>
        </div>
      </form>
      <div className="composer-brandline">
        <span className="brandline-spark">✳</span>Made for curious minds
        <span className="brandline-divider">·</span>Private to you
      </div>
      <span className="visually-hidden" aria-live="polite">{currentBytes ? `${(currentBytes / 1024 / 1024).toFixed(1)} MB attached` : ""}</span>
    </footer>
  );
}
