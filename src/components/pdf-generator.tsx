"use client";

import { Download, FileText, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

const MAX_DOCUMENT_CHARACTERS = 50_000;
const CANVAS_WIDTH = 1240;
const CANVAS_HEIGHT = 1754;
const PAGE_LINE_COUNT = 33;

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";

      let fragment = "";
      for (const character of Array.from(word)) {
        const nextFragment = fragment + character;
        if (fragment && context.measureText(nextFragment).width > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment = nextFragment;
        }
      }
      line = fragment;
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [""];
}

function supportsSelectableText(value: string): boolean {
  return /^[\u0009\u000a\u000d\u0020-\u00ff]*$/.test(value);
}

function addSelectablePage(
  pdf: import("jspdf").jsPDF,
  title: string,
  lines: string[],
  page: number,
  pageCount: number,
) {
  pdf.setTextColor(23, 23, 23);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(title, 18, 20, { maxWidth: 174 });
  pdf.setDrawColor(215, 215, 215);
  pdf.setLineWidth(0.35);
  pdf.line(18, 28, 192, 28);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  lines.forEach((line, index) => {
    if (line) pdf.text(line, 18, 38 + index * 7.1, { maxWidth: 174 });
  });

  pdf.setTextColor(119, 119, 119);
  pdf.setFontSize(8);
  pdf.text(`Created with Cybertron · ${page} / ${pageCount}`, 18, 286);
}

function createPageCanvas(title: string, lines: string[], page: number, pageCount: number): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create the PDF pages.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#171717";
  context.font = "bold 34px Arial, sans-serif";
  context.fillText(title, 92, 100, CANVAS_WIDTH - 184);
  context.strokeStyle = "#d9d9d9";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(92, 132);
  context.lineTo(CANVAS_WIDTH - 92, 132);
  context.stroke();

  context.fillStyle = "#262626";
  context.font = "26px Arial, sans-serif";
  context.textBaseline = "top";
  lines.forEach((line, index) => {
    if (line) context.fillText(line, 92, 170 + index * 43, CANVAS_WIDTH - 184);
  });

  context.fillStyle = "#777777";
  context.font = "18px Arial, sans-serif";
  context.textBaseline = "alphabetic";
  context.fillText(`Created with Cybertron · ${page} / ${pageCount}`, 92, CANVAS_HEIGHT - 70);
  return canvas;
}

export default function PdfGenerator({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("My document");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const convertToPdf = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = content.trim();
    if (!text || loading) return;

    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      const { jsPDF } = await import("jspdf");
      const measureCanvas = window.document.createElement("canvas");
      const context = measureCanvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare this document.");
      context.font = "26px Arial, sans-serif";
      const lines = wrapText(context, text, CANVAS_WIDTH - 184);
      const pageCount = Math.max(1, Math.ceil(lines.length / PAGE_LINE_COUNT));
      const documentTitle = title.trim().slice(0, 80) || "My document";
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const selectableText = supportsSelectableText(`${documentTitle}\n${text}`);

      for (let page = 0; page < pageCount; page += 1) {
        if (page > 0) pdf.addPage();
        const pageLines = lines.slice(page * PAGE_LINE_COUNT, (page + 1) * PAGE_LINE_COUNT);
        if (selectableText) {
          addSelectablePage(pdf, documentTitle, pageLines, page + 1, pageCount);
        } else {
          const canvas = createPageCanvas(documentTitle, pageLines, page + 1, pageCount);
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297, undefined, "FAST");
          canvas.width = 0;
          canvas.height = 0;
        }
      }

      const fileName = documentTitle
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "Cybertron document";
      pdf.save(`${fileName}.pdf`);
      setSuccess(true);
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "Could not create this PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="image-generator-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="image-generator pdf-generator" role="dialog" aria-modal="true" aria-labelledby="pdf-generator-title">
        <header className="image-generator-header">
          <div>
            <span className="tool-option-icon tool-search-icon"><FileText size={17} /></span>
            <div>
              <h2 id="pdf-generator-title">PDF workspace</h2>
              <p>Paste text and download it as a PDF</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close PDF workspace">
            <X size={18} />
          </button>
        </header>

        <form className="pdf-generator-form" onSubmit={convertToPdf}>
          <label htmlFor="pdf-title">Document name</label>
          <input
            id="pdf-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            placeholder="My document"
          />
          <label htmlFor="pdf-content">Paste or type your content</label>
          <textarea
            id="pdf-content"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setSuccess(false);
            }}
            maxLength={MAX_DOCUMENT_CHARACTERS}
            rows={12}
            placeholder="Paste your text here…"
            required
          />
          <div className="pdf-generator-actions">
            <span>{content.length.toLocaleString()} / {MAX_DOCUMENT_CHARACTERS.toLocaleString()} characters</span>
            <button className="image-generate-button" type="submit" disabled={!content.trim() || loading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
              {loading ? "Converting…" : "Convert & download PDF"}
            </button>
          </div>
        </form>

        {error && <p className="image-generator-error" role="alert">{error}</p>}
        {success && (
          <p className="pdf-generator-success" role="status">
            Your PDF is ready and downloaded. Your text stayed in this browser.
          </p>
        )}
      </section>
    </div>
  );
}
