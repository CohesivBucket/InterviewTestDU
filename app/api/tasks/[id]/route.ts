import { updateTask, deleteTask } from "@/lib/db";

// Allow large payloads for file attachments
export const maxDuration = 30;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const updated = await updateTask(id, body);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ task: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteTask(id);
  return Response.json({ success: true });
}