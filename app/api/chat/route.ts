import OpenAI from "openai";
import * as db from "@/lib/db";

// ─── OpenAI client ────────────────────────────────────────────────────────────

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = "gpt-4o-mini";
const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];

// ─── Tools definition (OpenAI function calling) ───────────────────────────────

const TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "create_task",
    description: "Create a single task in the database. Call this once per task. For multiple tasks, call this function multiple times.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The task title" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority level" },
        due_date: { type: "string", description: "Due date as YYYY-MM-DD, or natural language like 'tomorrow', 'friday', 'next week'" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "get_tasks",
    description: "Fetch tasks from the database with optional filtering",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "todo", "in_progress", "done", "overdue", "high", "medium", "low"],
          description: "Filter tasks by status or priority",
        },
        limit: { type: "number", description: "Max number of tasks to return" },
      },
    },
  },
  {
    type: "function",
    name: "update_task",
    description: "Update a task's status, priority, title, or due date. Find the task by searching its title.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        title_search: { type: "string", description: "Search string to find the task by title" },
        status: { type: "string", enum: ["todo", "in_progress", "done"], description: "New status" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "New priority" },
        new_title: { type: "string", description: "New title if renaming" },
        due_date: { type: "string", description: "New due date as YYYY-MM-DD" },
      },
      required: ["title_search"],
    },
  },
  {
    type: "function",
    name: "delete_task",
    description: "Permanently delete a task from the database by searching its title.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        title_search: { type: "string", description: "Search string to find the task to delete" },
      },
      required: ["title_search"],
    },
  },
  {
    type: "function",
    name: "delete_all_tasks",
    description: "Delete ALL tasks from the database. Only use when user explicitly asks to clear everything.",
    strict: false,
    parameters: { type: "object", properties: {} },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "create_task": {
        const priority = (["low","medium","high"].includes(args.priority)) ? args.priority : "medium";
        const dueDate = args.due_date ? db.parseDate(args.due_date) ?? undefined : undefined;
        const task = await db.createTask({ title: args.title, priority, dueDate });
        return JSON.stringify({ success: true, task });
      }

      case "get_tasks": {
        let tasks;
        const filter = args.filter ?? "all";
        if (filter === "overdue") tasks = await db.getOverdueTasks();
        else if (filter === "high" || filter === "medium" || filter === "low") tasks = await db.getTasksByPriority(filter);
        else if (filter === "todo" || filter === "in_progress" || filter === "done") tasks = await db.getTasksByStatus(filter);
        else tasks = await db.getAllTasks();
        if (args.limit) tasks = tasks.slice(0, args.limit);
        return JSON.stringify({ success: true, count: tasks.length, tasks });
      }

      case "update_task": {
        const all = await db.getAllTasks();
        const match = all.find(t =>
          t.title.toLowerCase().includes(args.title_search.toLowerCase())
        );
        if (!match) return JSON.stringify({ success: false, error: `No task found matching "${args.title_search}"` });
        const updates: any = {};
        if (args.status) updates.status = args.status;
        if (args.priority) updates.priority = args.priority;
        if (args.new_title) updates.title = args.new_title;
        if (args.due_date) updates.dueDate = args.due_date;
        const updated = await db.updateTask(match.id, updates);
        return JSON.stringify({ success: true, task: updated });
      }

      case "delete_task": {
        const all = await db.getAllTasks();
        const match = all.find(t =>
          t.title.toLowerCase().includes(args.title_search.toLowerCase())
        );
        if (!match) return JSON.stringify({ success: false, error: `No task found matching "${args.title_search}"` });
        await db.deleteTask(match.id);
        return JSON.stringify({ success: true, deleted: match.title });
      }

      case "delete_all_tasks": {
        const all = await db.getAllTasks();
        for (const task of all) await db.deleteTask(task.id);
        return JSON.stringify({ success: true, deleted_count: all.length });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ success: false, error: String(err) });
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { messages, model: requestedModel, images } = await req.json();
    const history: { role: string; content: string }[] = messages ?? [];
    const selectedModel = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
    const attachedImages: string[] = images ?? [];

    // Build conversation history string
    const conversationHistory = history
      .slice(0, -1)
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
      )
      .join("\n\n");

    const lastMessage = history[history.length - 1]?.content ?? "";

    const fullInputText = [
      conversationHistory ? `Previous conversation:\n${conversationHistory}\n\n---\n\n` : "",
      `User: ${lastMessage}`,
    ].join("");

    // Build input — use multimodal format if images are attached
    let firstInput: string | any[];
    if (attachedImages.length > 0) {
      const content: any[] = [{ type: "input_text", text: fullInputText }];
      for (const img of attachedImages) {
        content.push({ type: "input_image", image_url: img });
      }
      firstInput = content;
    } else {
      firstInput = fullInputText;
    }

    // ── Agentic loop — keep calling until no more tool calls ─────────────────
    let currentInput: string | any[] = firstInput;
    let finalText = "";
    let iterations = 0;
    const MAX_ITERATIONS = 20; // safety limit for bulk task creation

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await client.responses.create({
        model: selectedModel,
        instructions: getSystemPrompt(),
        input: currentInput,
        tools: TOOLS,
        store: true,
      });

      // Check if there are tool calls to execute
      const toolCalls = response.output.filter(
        (o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call"
      );

      if (toolCalls.length === 0) {
        // No tool calls — we have the final text response
        finalText = response.output_text;
        break;
      }

      // Execute all tool calls and collect results
      const toolResults: string[] = [];
      for (const toolCall of toolCalls) {
        const args = typeof toolCall.arguments === "string"
          ? JSON.parse(toolCall.arguments)
          : toolCall.arguments;
        const result = await executeTool(toolCall.name, args);
        toolResults.push(`Tool "${toolCall.name}" result: ${result}`);
      }

      // Feed results back as next input (always string after first iteration)
      const inputText = typeof currentInput === "string" ? currentInput : fullInputText;
      currentInput = `${inputText}\n\nAssistant called tools:\n${toolCalls.map((tc) => `- ${tc.name}(${tc.arguments})`).join("\n")}\n\nTool results:\n${toolResults.join("\n")}\n\nNow provide a concise response to the user confirming what was done.`;
    }

    return Response.json({ text: finalText || "Done.", model: selectedModel });

  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { text: "Something went wrong. Please try again.", error: String(error) },
      { status: 500 }
    );
  }
}