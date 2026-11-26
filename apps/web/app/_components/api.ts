import type { getDocument, getProgress, listDocuments } from "@app/db";

// Response types come from the API's own read models; dates arrive as strings.
type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

export type DocumentDetail = Json<Awaited<ReturnType<typeof getDocument>>>;
export type DocumentSummary = Json<Awaited<ReturnType<typeof listDocuments>>[number]>;
export type Progress = Json<Awaited<ReturnType<typeof getProgress>>>;
export type ValueView = DocumentDetail["values"][number];
export type VersionStatus = DocumentDetail["currentVersion"]["status"];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new ApiError(res.status, body?.message ?? `Request failed (${res.status}).`);
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  listDocuments: () => request<DocumentSummary[]>("/documents"),
  getDocument: (id: string, version?: number) =>
    request<DocumentDetail>(`/documents/${encodeURIComponent(id)}${version ? `?version=${version}` : ""}`),
  uploadDocument: (form: FormData) =>
    request<{ documentId: string; number: number }>("/documents", { method: "POST", body: form }),
  uploadVersion: (id: string, form: FormData) =>
    request<{ documentId: string; number: number }>(`/documents/${encodeURIComponent(id)}/versions`, {
      method: "POST",
      body: form,
    }),
  retry: (id: string) =>
    request<{ requeued: boolean }>(`/documents/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  review: (valueId: string, body: { action: "approve" } | { action: "correct"; correctedValue: string; note?: string }) =>
    request<unknown>(`/values/${valueId}/review`, json(body)),
};

export const isInProgress = (status: VersionStatus) => status === "queued" || status === "extracting";

/** How often to poll: every 2s while extraction is running, otherwise not at all. */
export const POLL_MS = 2_000;
