import { streamText, tool, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import * as db from "@/lib/db";
import type { TaskAttachment } from "@/lib/types";

// Config

export const maxDuration = 120; // image generation can take a while

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
      // User-uploaded images (file parts)
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

// ─── Extract prompts from previous generate_image tool calls ─────────

function extractGeneratedImagePrompts(messages: UIMessage[]): string[] {
  const prompts: string[] = [];
  for (const msg of messages) {
    if (!msg.parts) continue;
    for (const part of msg.parts) {
      const tp = part as unknown as {
        type?: string;
        toolName?: string;
        output?: Record<string, unknown>;
        state?: string;
      };
      // Match tool-generate_image parts with successful output
      if (
        (tp.type === "tool-generate_image" || tp.toolName === "generate_image") &&
        tp.state === "output-available" &&
        tp.output?.success === true &&
        tp.output?.prompt &&
        typeof tp.output.prompt === "string"
      ) {
        prompts.push(tp.output.prompt as string);
      }
    }
  }
  return prompts;
}

// ─── Generate an image via OpenAI API (for task attachment) ──────────

async function generateImageForAttachment(prompt: string): Promise<TaskAttachment | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const models = ["gpt-image-1", "dall-e-3"] as const;

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      prompt: `${prompt}. Make it high quality and visually appealing.`,
      n: 1,
      size: "1024x1024",
    };
    if (model === "dall-e-3") {
      body.response_format = "b64_json";
    }

    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
        };
        const img = data.data?.[0];
        if (!img) continue;

        const imageDataUrl = img.b64_json
          ? `data:image/png;base64,${img.b64_json}`
          : img.url ?? "";

        if (imageDataUrl) {
          return {
            name: `generated-${prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.png`,
            type: "image/png",
            dataUrl: imageDataUrl,
          };
        }
      }

      const errBody = await res.text();
      if (res.status === 404 || errBody.includes("model_not_found")) continue;
      console.error(`Image gen for attachment error (${model}):`, res.status, errBody);
      break; // Non-recoverable error, stop trying
    } catch (err) {
      console.error(`Image gen for attachment network error (${model}):`, err);
      break;
    }
  }
  return null;
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
You can attach images to tasks in two ways:
1. **User-uploaded images**: When a user shares images in the chat, set \`attach_chat_images: true\` on create_task or update_task.
2. **AI-generated images**: When a user wants to save a previously generated image to a task, set \`attach_generated_images: true\` on create_task or update_task. This will find the most recent generated image from the conversation and attach it.

You can use both flags together. ALWAYS use these when the user wants images attached to tasks — you DO have this ability.
When a user says "save that image" or "add that image to a task", use \`attach_generated_images: true\`.
When creating a task that references a generated image, ALWAYS set \`attach_generated_images: true\`.

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

  // Closure variable for images generated within this request
  const generatedImages: TaskAttachment[] = [];

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
          "Create a single task in the database. Call this once per task. For multiple tasks, call this function multiple times. Set attach_chat_images to true to attach user-uploaded images, and/or attach_generated_images to true to attach AI-generated images from the conversation.",
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
              "Set to true to attach all user-uploaded images from the chat to this task"
            ),
          attach_generated_images: z
            .boolean()
            .optional()
            .describe(
              "Set to true to attach AI-generated images from the conversation to this task. Will find the most recent generate_image result and attach it."
            ),
        }),
        execute: async ({ title, description, priority, due_date, attach_chat_images, attach_generated_images }) => {
          const p = priority ?? "medium";
          const dueDate = due_date ? db.parseDate(due_date) : undefined;

          // Collect attachments from different sources
          const attachments: TaskAttachment[] = [];

          // User-uploaded images
          if (attach_chat_images && chatImages.length > 0) {
            attachments.push(...chatImages);
          }

          // AI-generated images
          if (attach_generated_images) {
            // First check same-request closure
            if (generatedImages.length > 0) {
              attachments.push(...generatedImages);
            } else {
              // Cross-request: find prompts from previous generate_image calls
              const prompts = extractGeneratedImagePrompts(messages);
              if (prompts.length > 0) {
                // Generate from the most recent prompt
                const latestPrompt = prompts[prompts.length - 1];
                const img = await generateImageForAttachment(latestPrompt);
                if (img) {
                  attachments.push(img);
                  generatedImages.push(img); // Cache for potential re-use
                }
              }
            }
          }

          const task = await db.createTask({
            title,
            description,
            priority: p,
            dueDate,
            attachments: attachments.length > 0 ? attachments : undefined,
          });
          return {
            success: true as const,
            task,
            attachedImages: attachments.length,
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
          "Update a task's status, priority, title, due date, or attachments. Find the task by searching its title. Set attach_chat_images to true to add user-uploaded images, and/or attach_generated_images to true to add AI-generated images.",
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
              "Set to true to add user-uploaded images from the chat to this task"
            ),
          attach_generated_images: z
            .boolean()
            .optional()
            .describe(
              "Set to true to add AI-generated images from the conversation to this task"
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
          attach_generated_images,
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

          // Collect new images to attach
          const newImages: TaskAttachment[] = [];

          if (attach_chat_images && chatImages.length > 0) {
            newImages.push(...chatImages);
          }

          if (attach_generated_images) {
            // Same-request closure first
            if (generatedImages.length > 0) {
              newImages.push(...generatedImages);
            } else {
              // Cross-request: find prompts from previous generate_image calls
              const prompts = extractGeneratedImagePrompts(messages);
              if (prompts.length > 0) {
                const latestPrompt = prompts[prompts.length - 1];
                const img = await generateImageForAttachment(latestPrompt);
                if (img) {
                  newImages.push(img);
                  generatedImages.push(img);
                }
              }
            }
          }

          if (newImages.length > 0) {
            const existing = match.attachments ?? [];
            updates.attachments = [...existing, ...newImages];
          }

          const updated = await db.updateTask(match.id, updates);
          return {
            success: true as const,
            task: updated,
            attachedImages: newImages.length,
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
          "Generate an image using AI (OpenAI DALL-E). Use when the user asks to create, draw, design, or generate any kind of image, illustration, logo, diagram, or visual content.",
        inputSchema: z.object({
          prompt: z
            .string()
            .describe(
              "Detailed description of the image to generate. Be specific about style, colors, composition, and subject matter."
            ),
        }),
        execute: async ({ prompt }) => {
          // Return lightweight result — the ToolCard fetches the actual image
          // client-side from /api/generate-image (which checks the API key).
          // This avoids sending 1MB+ base64 back through the LLM context.
          // When the user later asks to attach this image to a task, the
          // create_task/update_task tools will generate it server-side.
          return {
            success: true as const,
            prompt,
            status: "ready" as const,
            message: `Image generated for: "${prompt}". The image is displayed in the chat. Use attach_generated_images on create_task/update_task to save it to a task.`,
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
