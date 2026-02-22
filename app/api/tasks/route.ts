import { getAllTasks } from "@/lib/db";

export async function GET() {
  const tasks = await getAllTasks();
  return Response.json({ tasks });
}