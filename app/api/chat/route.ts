import { streamText, tool, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import * as db from "@/lib/db";
import type { TaskAttachment } from "@/lib/types";

// Config

const DEFAULT_MODEL = "gpt-5-mini";
const ALLOWED_MODELS = [
  "gpt-4o-mini", "gpt-5-nano", "gpt-5-mini",
  "gpt-5", "gpt-5.1", "gpt-5.2", "gpt-5.2-pro",
  "o4-mini",
];

// ─── Extract image attachments from chat messages ────────────────────

interface FilePart {
  type: "file";
  mediaType?: string;
  url?: string;
  filename?: string;
  name?: string;
}

function extractChatImages(messages: UIMessage[]): TaskAttachment[] {
  const images: TaskAttachment[] = [];
  for (const msg of messages) {
    if (!msg.parts) continue;
    for (const part of msg.parts) {
      const fp = part as unknown as FilePart;
      if (
        fp.type === "file" &&
        fp.mediaType?.startsWith("image/") &&
        fp.url
      ) {
        images.push({
          name: fp.filename ?? fp.name ?? `image.${fp.mediaType.split("/")[1] ?? "png"}`,
          type: fp.mediaType,
          dataUrl: fp.url,
        });
      }
    }
  }
  return images;
}

// System prompt

async function getSystemPrompt(): Promise<string> {
  const allTasks = await db.getAllTasks();
  const taskSummary =
    allTasks.length > 0
      ? allTasks
          .map(
            (t) =>
              `- [${t.status}] ${t.title} (${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ""})`
          )
          .join("\n")
      : "No tasks yet.";

  return `You are TaskFlow AI — a sharp, efficient task management assistant.
Today's date: ${new Date().toISOString().split("T")[0]}.

## Current Tasks
${taskSummary}

## Capabilities
You have tools to CREATE, READ, UPDATE, and DELETE tasks in a real database.
You can also GENERATE IMAGES using AI (powered by OpenAI DALL-E) — use the generate_image tool when users want to create, draw, design, or visualize anything.
Always use your tools — never pretend to create or delete tasks without calling the function.

## Image Attachments
When a user shares images in the chat and asks you to create a task with those images, set attach_chat_images to true. This will automatically attach all images from the conversation to the task.
You can also add images to existing tasks using the update_task tool with attach_chat_images: true.
You DO have this ability — always use it when the user wants images attached to tasks.

## Response Style
- Use **markdown formatting**: headers, bold, lists, code blocks when appropriate
- Be concise and action-oriented
- After completing actions, briefly confirm what was done
- When listing tasks, use structured formatting
- Proactively suggest next actions when relevant (e.g., "Want me to set a due date?")

## Rules
- To create multiple tasks: call create_task once for EACH task individually
- To delete a task: call delete_task with a search string matching the title
- To mark done: call update_task with status "done"
- Always confirm what was actually done after tool calls
- If the user's request is ambiguous, ask for clarification`;
}

// POST /api/chat

export async function POST(req: Request) {
  try {
  const { messages: rawMessages, model: requestedModel } = (await req.json()) as {
    messages: UIMessage[];
    model?: string;
  };

  // Ensure all messages have parts array (AI SDK v6 requirement)
  const messages: UIMessage[] = rawMessages.map((msg) => {
    if (msg.parts && msg.parts.length > 0) return msg;
    // Convert legacy content-based messages to parts format
    const content = (msg as unknown as { content?: string }).content;
    return {
      ...msg,
      parts: [{ type: "text" as const, text: content ?? "" }],
    };
  });

  // Extract images from the conversation for tool access
  const chatImages = extractChatImages(messages);

  const selectedModel = ALLOWED_MODELS.includes(requestedModel ?? "")
    ? requestedModel!
    : DEFAULT_MODEL;

  const result = streamText({
    model: openai(selectedModel),
    system: await getSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      create_task: tool({
        description:
          "Create a single task in the database. Call this once per task. For multiple tasks, call this function multiple times. Set attach_chat_images to true to attach any images the user shared in the conversation.",
        inputSchema: z.object({
          title: z.string().describe("The task title"),
          description: z
            .string()
            .optional()
            .describe("Task description or notes"),
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
          attach_chat_images: z
            .boolean()
            .optional()
            .describe(
              "Set to true to attach all images from the current chat conversation to this task"
            ),
        }),
        execute: async ({ title, description, priority, due_date, attach_chat_images }) => {
          const p = priority ?? "medium";
          const dueDate = due_date ? db.parseDate(due_date) : undefined;
          const attachments = attach_chat_images ? chatImages : undefined;
          const task = await db.createTask({
            title,
            description,
            priority: p,
            dueDate,
            attachments,
          });
          return {
            success: true as const,
            task,
            attachedImages: attach_chat_images ? chatImages.length : 0,
          };
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
          "Update a task's status, priority, title, due date, or attachments. Find the task by searching its title. Set attach_chat_images to true to add images from the conversation.",
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
          description: z
            .string()
            .optional()
            .describe("New or updated description"),
          due_date: z
            .string()
            .optional()
            .describe("New due date as YYYY-MM-DD"),
          attach_chat_images: z
            .boolean()
            .optional()
            .describe(
              "Set to true to add all images from the current chat conversation to this task's attachments"
            ),
        }),
        execute: async ({
          title_search,
          status,
          priority,
          new_title,
          description,
          due_date,
          attach_chat_images,
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
          const updates: Record<string, unknown> = {};
          if (status) updates.status = status;
          if (priority) updates.priority = priority;
          if (new_title) updates.title = new_title;
          if (description) updates.description = description;
          if (due_date) updates.dueDate = due_date;
          if (attach_chat_images && chatImages.length > 0) {
            // Merge existing attachments with new chat images
            const existing = match.attachments ?? [];
            updates.attachments = [...existing, ...chatImages];
          }
          const updated = await db.updateTask(match.id, updates);
          return {
            success: true as const,
            task: updated,
            attachedImages: attach_chat_images ? chatImages.length : 0,
          };
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

      generate_image: tool({
        description:
          "Generate an image using AI (Gemini). Use when the user asks to create, draw, design, or generate any kind of image, illustration, logo, diagram, or visual content.",
        inputSchema: z.object({
          prompt: z
            .string()
            .describe(
              "Detailed description of the image to generate. Be specific about style, colors, composition, and subject matter."
            ),
        }),
        execute: async ({ prompt }) => {
          // Always return success — the ToolCard fetches the actual image
          // client-side from /api/generate-image (which checks the API key).
          // This avoids sending 1MB+ base64 back through the LLM context.
          return {
            success: true as const,
            prompt,
            status: "ready" as const,
            message: `Image generation initiated for: "${prompt}". The image is being rendered in the chat.`,
          };
        },
      }),
    },
    stopWhen: stepCountIs(20),
  });

  return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
