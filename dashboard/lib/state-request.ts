export const MAX_PAYLOAD_BYTES = 1_500_000;
export class StateRequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function readStateRequest(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new StateRequestError("Cross-site writes are not permitted.", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new StateRequestError("Use application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new StateRequestError("An update is required.", 400);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_PAYLOAD_BYTES) { await reader.cancel(); throw new StateRequestError("This update exceeds the safe sync limit.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new StateRequestError("The update was not valid JSON.", 400); }
  if (!body || Array.isArray(body) || typeof body !== "object") throw new StateRequestError("An update object is required.", 400);
  if (typeof body.baseRevision !== "number" || !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) throw new StateRequestError("A valid base revision is required.", 400);
  const snapshot = body.snapshot as Record<string, unknown> | undefined;
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object" || snapshot.schemaVersion !== 1) throw new StateRequestError("A supported dashboard snapshot is required.", 400);
  const limits: Record<string, number> = { tasks: 2000, events: 3000, schedule: 1000, assignments: 1000, exams: 300, habits: 300, captures: 2000 };
  for (const [key, limit] of Object.entries(limits)) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].length > limit) throw new StateRequestError(`Invalid or oversized ${key} collection.`, 422);
  }
  if (!snapshot.notes || typeof snapshot.notes !== "object" || Array.isArray(snapshot.notes) || typeof (snapshot.notes as {plain?:unknown}).plain !== "string" || ((snapshot.notes as {plain:string}).plain.length > 200000)) throw new StateRequestError("Invalid or oversized notes document.", 422);
  return { baseRevision: body.baseRevision, snapshot };
}
