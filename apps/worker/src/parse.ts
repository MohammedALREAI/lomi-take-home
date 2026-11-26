import { normalizeText } from "@app/core";
import { extractText, getDocumentProxy } from "unpdf";

/** Extracts the PDF's text, normalized once; every evidence offset indexes into the result. */
export async function parsePdf(pdf: Uint8Array): Promise<string> {
  // pdf.js takes ownership of (detaches) the buffer it is given, so pass a copy.
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return normalizeText(text);
}
