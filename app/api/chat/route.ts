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

  // Edge Config has a 2MB body limit, so we need compact images.
  // Strategy: try gpt-image-1 with JPEG output (much smaller than PNG),
  // then fall back to dall-e-3 with size check.

  // Attempt 1: gpt-image-1 with JPEG output_format for smaller file size
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `${prompt}. Make it visually appealing.`,
        n: 1,
        size: "1024x1024",
        quality: "low",           // Smaller file for storage
        output_format: "jpeg",    // JPEG is ~5-10x smaller than PNG
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };
      const img = data.data?.[0];
      const b64 = img?.b64_json;
      if (b64 && b64.length < 1_400_000) { // ~1.4MB base64 = ~1MB file, safe for Edge Config
        return {
          name: `generated-${prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.jpg`,
          type: "image/jpeg",
          dataUrl: `data:image/jpeg;base64,${b64}`,
        };
      }
      if (b64) {
        console.warn(`gpt-image-1 JPEG still too large: ${b64.length} chars, skipping`);
      }
    } else {
      const errBody = await res.text();
      console.error("gpt-image-1 JPEG attempt failed:", res.status, errBody.slice(0, 200));
      // If unknown parameter, fall through to attempt 2
    }
  } catch (err) {
    console.error("gpt-image-1 JPEG network error:", err);
  }

  // Attempt 2: gpt-image-1 without output_format (PNG, but with quality:low)
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `${prompt}. Simple, clean style.`,
        n: 1,
        size: "1024x1024",
        quality: "low",
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ b64_json?: string }>;
      };
      const b64 = data.data?.[0]?.b64_json;
      if (b64 && b64.length < 1_400_000) {
        return {
          name: `generated-${prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.png`,
          type: "image/png",
          dataUrl: `data:image/png;base64,${b64}`,
        };
      }
      if (b64) {
        console.warn(`gpt-image-1 PNG low-q still too large: ${b64.length} chars`);
      }
    }
  } catch (err) {
    console.error("gpt-image-1 low-q attempt error:", err);
  }

  // Attempt 3: dall-e-3 (usually produces smaller PNGs)
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `${prompt}. Simple, clean style.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "b64_json",
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ b64_json?: string }>;
      };
      const b64 = data.data?.[0]?.b64_json;
      if (b64 && b64.length < 1_400_000) {
        return {
          name: `generated-${prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.png`,
          type: "image/png",
          dataUrl: `data:image/png;base64,${b64}`,
        };
      }
      if (b64) {
        console.warn(`dall-e-3 still too large: ${b64.length} chars`);
      }
    }
  } catch (err) {
    console.error("dall-e-3 attachment error:", err);
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

  // Closure variables for image handling within this request
  const generatedImages: TaskAttachment[] = [];
  const pendingImagePrompts: string[] = []; // Prompts from generate_image tool calls in this request

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
            // 1. Check already-generated images in this request
            if (generatedImages.length > 0) {
              attachments.push(...generatedImages);
            } else {
              // 2. Check pending prompts from generate_image calls in this request
              const promptSource = pendingImagePrompts.length > 0
                ? pendingImagePrompts
                : extractGeneratedImagePrompts(messages); // 3. Cross-request fallback

              if (promptSource.length > 0) {
                const latestPrompt = promptSource[promptSource.length - 1];
                const img = await generateImageForAttachment(latestPrompt);
                if (img) {
                  attachments.push(img);
                  generatedImages.push(img); // Cache for potential re-use in same request
                }
              }
            }
          }

          // Try creating with attachments; if too large, retry without
          try {
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
          } catch (err: unknown) {
            const errStr = String(err);
            if (attachments.length > 0 && (errStr.includes("entity_too_large") || errStr.includes("2mb"))) {
              // Retry without attachments
              console.warn("Task attachment too large, creating without image");
              const task = await db.createTask({
                title,
                description,
                priority: p,
                dueDate,
              });
              return {
                success: true as const,
                task,
                attachedImages: 0,
                note: "Image was too large to store. Task created without attachment.",
              };
            }
            throw err;
          }
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
            // 1. Already-generated images in this request
            if (generatedImages.length > 0) {
              newImages.push(...generatedImages);
            } else {
              // 2. Pending prompts from this request, or 3. cross-request fallback
              const promptSource = pendingImagePrompts.length > 0
                ? pendingImagePrompts
                : extractGeneratedImagePrompts(messages);

              if (promptSource.length > 0) {
                const latestPrompt = promptSource[promptSource.length - 1];
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

          // Try updating; if too large, retry without new images
          try {
            const updated = await db.updateTask(match.id, updates);
            return {
              success: true as const,
              task: updated,
              attachedImages: newImages.length,
            };
          } catch (err: unknown) {
            const errStr = String(err);
            if (newImages.length > 0 && (errStr.includes("entity_too_large") || errStr.includes("2mb"))) {
              console.warn("Task attachment too large, updating without image");
              delete updates.attachments;
              const updated = await db.updateTask(match.id, updates);
              return {
                success: true as const,
                task: updated,
                attachedImages: 0,
                note: "Image was too large to store. Task updated without attachment.",
              };
            }
            throw err;
          }
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
          // Store the prompt so create_task/update_task can generate
          // the image server-side for attachment in the same request.
          pendingImagePrompts.push(prompt);

          // Return lightweight result — the ToolCard fetches the actual image
          // client-side from /api/generate-image. This avoids sending 1MB+
          // base64 through the LLM context.
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
