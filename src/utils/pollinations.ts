export function getImagePrompt(message: string): string | null {
  const prompt = message.trim();
  const explicitImageRequest = prompt.match(
    /(?:generate|create|make|render)\s+(?:(?:me|an?|the)\s+)*(?:image|picture|photo|artwork|illustration|portrait|scene|logo|icon)\s*(?:(?:of|showing|depicting|for|with)\s+|:\s*)?(.+)/i,
  );
  if (explicitImageRequest?.[1]) return explicitImageRequest[1].trim();

  const drawingRequest = prompt.match(/(?:^|\b)(?:draw|paint|illustrate)\s+(?:me\s+)?(.+)/i);
  const drawingPrompt = drawingRequest?.[1]?.trim();
  if (!drawingPrompt || /^(?:(?:a|the)\s+)?(?:conclusion|conclusions|attention|inference|inferences|distinction|distinctions|comparison|comparisons)\b/i.test(drawingPrompt)) {
    return null;
  }
  return drawingPrompt;
}
