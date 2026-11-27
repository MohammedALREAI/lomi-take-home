import { normalizeText } from "@app/core";
import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";

/** Preloads PDF.js at worker startup so the first user upload avoids cold-start latency. */
export async function warmupPdfParser(): Promise<void> {
  try {
    await getResolvedPDFJS();
  } catch {
    // Non-fatal: parsePdf will initialize lazily if pre-warm fails.
  }
}

/** Extracts the PDF's text, normalized once; every evidence offset indexes into the result. */
export async function parsePdf(pdf: Uint8Array): Promise<string> {
  // pdf.js takes ownership of (detaches) the buffer it is given, so pass a copy.
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return normalizeText(text);
}
