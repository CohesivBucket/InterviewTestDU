import { streamText, tool, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import * as db from "@/lib/db";

// Config

const DEFAULT_MODEL = "gpt-5-mini";
const ALLOWED_MODELS = [
  "gpt-4o-mini", "gpt-5-nano", "gpt-5-mini",
  "gpt-5", "gpt-5.1", "gpt-5.2", "gpt-5.2-pro",
  "o4-mini",
];

// System prompt

function getSystemPrompt(): string {
  return `You are TaskFlow AI — a sharp, efficient task management assistant.
Today's date: ${new Date().toISOString().split("T")[0]}.

You have tools to CREATE, READ, UPDATE, and DELETE tasks in a real database.
Always use your tools — never pretend to create or delete tasks without calling the function.

Rules:
- To create multiple tasks: call create_task once for EACH task individually
- To delete a task: call delete_task with a search string matching the title
- To mark done: call update_task with status "done"
- Always confirm what was actually done after tool calls
- Be concise and action-oriented`;
}

// POST /api/chat

export async function POST(req: Request) {
  const { messages, model: requestedModel } = (await req.json()) as {
    messages: UIMessage[];
    model?: string;
  };

  const selectedModel = ALLOWED_MODELS.includes(requestedModel ?? "")
    ? requestedModel!
    : DEFAULT_MODEL;

  const result = streamText({
    model: openai(selectedModel),
    system: getSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      create_task: tool({
        description:
          "Create a single task in the database. Call this once per task. For multiple tasks, call this function multiple times.",
        inputSchema: z.object({
          title: z.string().describe("The task title"),
          priority: z
            .enum(["low", "medium", "high"])
            .optional()
            .describe("Task priority level"),
          due_date: z
            .string()
            .optional()
            .describe(
              "Due date as YYYY-MM-DD, or natural language like 'tomorrow', 'friday', 'next week'"
            ),
        }),
        execute: async ({ title, priority, due_date }) => {
          const p = priority ?? "medium";
          const dueDate = due_date ? db.parseDate(due_date) : undefined;
          const task = await db.createTask({ title, priority: p, dueDate });
          return { success: true as const, task };
        },
      }),

      get_tasks: tool({
        description: "Fetch tasks from the database with optional filtering",
        inputSchema: z.object({
          filter: z
            .enum([
              "all",
              "todo",
              "in_progress",
              "done",
              "overdue",
              "high",
              "medium",
              "low",
            ])
            .optional()
            .describe("Filter tasks by status or priority"),
          limit: z
            .number()
            .optional()
            .describe("Max number of tasks to return"),
        }),
        execute: async ({ filter, limit }) => {
          let tasks;
          const f = filter ?? "all";
          if (f === "overdue") tasks = await db.getOverdueTasks();
          else if (f === "high" || f === "medium" || f === "low")
            tasks = await db.getTasksByPriority(f);
          else if (f === "todo" || f === "in_progress" || f === "done")
            tasks = await db.getTasksByStatus(f);
          else tasks = await db.getAllTasks();
          if (limit) tasks = tasks.slice(0, limit);
          return { success: true as const, count: tasks.length, tasks };
        },
      }),

      update_task: tool({
        description:
          "Update a task's status, priority, title, or due date. Find the task by searching its title.",
        inputSchema: z.object({
          title_search: z
            .string()
            .describe("Search string to find the task by title"),
          status: z
            .enum(["todo", "in_progress", "done"])
            .optional()
            .describe("New status"),
          priority: z
            .enum(["low", "medium", "high"])
            .optional()
            .describe("New priority"),
          new_title: z
            .string()
            .optional()
            .describe("New title if renaming"),
          due_date: z
            .string()
            .optional()
            .describe("New due date as YYYY-MM-DD"),
        }),
        execute: async ({
          title_search,
          status,
          priority,
          new_title,
          due_date,
        }) => {
          const all = await db.getAllTasks();
          const match = all.find((t) =>
            t.title.toLowerCase().includes(title_search.toLowerCase())
          );
          if (!match)
            return {
              success: false as const,
              error: `No task found matching "${title_search}"`,
            };
          const updates: Record<string, string> = {};
          if (status) updates.status = status;
          if (priority) updates.priority = priority;
          if (new_title) updates.title = new_title;
          if (due_date) updates.dueDate = due_date;
          const updated = await db.updateTask(match.id, updates);
          return { success: true as const, task: updated };
        },
      }),

      delete_task: tool({
        description:
          "Permanently delete a task from the database by searching its title.",
        inputSchema: z.object({
          title_search: z
            .string()
            .describe("Search string to find the task to delete"),
        }),
        execute: async ({ title_search }) => {
          const all = await db.getAllTasks();
          const match = all.find((t) =>
            t.title.toLowerCase().includes(title_search.toLowerCase())
          );
          if (!match)
            return {
              success: false as const,
              error: `No task found matching "${title_search}"`,
            };
          await db.deleteTask(match.id);
          return { success: true as const, deleted: match.title };
        },
      }),

      delete_all_tasks: tool({
        description:
          "Delete ALL tasks from the database. Only use when user explicitly asks to clear everything.",
        inputSchema: z.object({}),
        execute: async () => {
          const all = await db.getAllTasks();
          for (const task of all) await db.deleteTask(task.id);
          return { success: true as const, deleted_count: all.length };
        },
      }),
    },
    stopWhen: stepCountIs(20),
  });

  return result.toUIMessageStreamResponse();
}
