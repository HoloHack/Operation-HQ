import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { emptyHQState, sanitizeHQState } from "../../../lib/hq-state";
import { readStateRequest, StateRequestError } from "../../../lib/state-request";

export const dynamic = "force-dynamic";

type StoredRow = { revision: number; payload: string; updated_at: number };

async function current(userId: string) {
  const row = await env.DB!.prepare("SELECT revision, payload, updated_at FROM hq_state WHERE user_id = ?")
    .bind(userId)
    .first<StoredRow>();
  if (!row) return { revision: 0, snapshot: emptyHQState(), updatedAt: 0 };
  try {
    const parsed = JSON.parse(row.payload);
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.events) || !parsed.notes || typeof parsed.notes.plain !== "string") throw new Error("Invalid stored shape");
    return { revision: Number(row.revision) || 0, snapshot: sanitizeHQState(parsed), updatedAt: Number(row.updated_at) || 0 };
  } catch {
    throw new StateRequestError("Saved data needs recovery. It has not been overwritten.", 422);
  }
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Sync storage is unavailable." }, { status: 503 });
  try { return Response.json(await current(user.userId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return storageError(error); }
}

function storageError(error: unknown) {
  return Response.json({ error: error instanceof StateRequestError ? error.message : "Storage is temporarily unavailable. Your update was not confirmed." }, { status: error instanceof StateRequestError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Sync storage is unavailable." }, { status: 503 });

  try {
  const body = await readStateRequest(request);
  const baseRevision = body.baseRevision;
  const snapshot = sanitizeHQState(body.snapshot);
  const payload = JSON.stringify(snapshot);
  for (const key of ["tasks", "events", "schedule", "assignments", "exams", "habits", "captures"] as const) {
    const input = body.snapshot[key] as unknown[];
    if (snapshot[key].length !== input.length || new Set(snapshot[key].map(item => item.id)).size !== input.length) throw new StateRequestError(`Invalid or duplicate records in ${key}.`, 422);
  }
  // Validate the existing payload before allowing any overwrite, including a matching revision.
  const existing = await current(user.userId);
  if (existing.revision !== baseRevision) return Response.json({ error: "Your dashboard changed somewhere else.", ...existing }, { status: 409 });

  const now = Date.now();
  const nextRevision = baseRevision + 1;
  const result = await env.DB.prepare(`INSERT INTO hq_state (user_id, revision, schema_version, payload, updated_at)
    SELECT ?, ?, 1, ?, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM hq_state WHERE user_id = ?)
    ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, schema_version = 1, payload = excluded.payload, updated_at = excluded.updated_at
    WHERE hq_state.revision = ?`)
    .bind(user.userId, nextRevision, payload, now, baseRevision, user.userId, baseRevision)
    .run();

  if (!result.success || Number(result.meta.changes) !== 1) {
    return Response.json({ error: "Your dashboard changed somewhere else.", ...(await current(user.userId)) }, { status: 409 });
  }
  return Response.json({ revision: nextRevision, snapshot, updatedAt: now });
  } catch (error) { return storageError(error); }
}
