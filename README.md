# TaskFlow AI — Chat-First Task Management

A full-stack task management application where **chat is the primary interface**. Users create, edit, and manage tasks entirely through natural language conversation with an AI assistant powered by OpenAI.

Built with **Next.js 16**, **Vercel AI SDK**, and **TypeScript** end-to-end.

**Live demo**: [https://interview-test-du.vercel.app](https://interview-test-du.vercel.app)

---

## Tech Stack

| Layer         | Technology                                                     |
| ------------- | -------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router)                                       |
| AI            | Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`)       |
| Streaming     | `streamText` with `toUIMessageStreamResponse()` (SSE)          |
| Chat UI       | `useChat` hook from `@ai-sdk/react` (AI Elements)              |
| Tool calling  | AI SDK `tool()` with Zod schemas + server-side `execute`       |
| Language      | TypeScript end-to-end                                          |
| Data layer    | In-memory Map store (serverless-compatible)                    |
| Deployment    | Vercel (auto-deploy from GitHub)                               |

---

## Architecture

```
app/
  page.tsx            <- Client: useChat hook, TaskCard, ToolCard, sidebar, theme
  api/
    chat/route.ts     <- POST: streamText + 5 tools (create, get, update, delete, delete_all)
    tasks/route.ts    <- GET: fetch all tasks for sidebar sync
    tasks/[id]/
      route.ts        <- PATCH + DELETE: direct task mutations from sidebar UI
lib/
  db.ts               <- In-memory CRUD store with Task type, date parser
```

### Data Flow

1. User types a message - `useChat` sends it to `/api/chat`
2. `streamText` calls the LLM with tool definitions (Zod schemas)
3. LLM decides which tools to call - AI SDK auto-executes them server-side
4. Tool results are fed back to the LLM (up to 20 steps via `stopWhen`)
5. Final text + tool invocation parts stream to client as SSE
6. Client renders text parts as chat bubbles, tool parts as structured **ToolCards**
7. Sidebar re-fetches tasks after each response to stay in sync

### Tool Definitions

| Tool             | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `create_task`    | Creates a task with title, priority, due date          |
| `get_tasks`      | Fetches tasks with optional filter (status/priority)   |
| `update_task`    | Updates status, priority, title, or due date by search |
| `delete_task`    | Deletes a task by title search                         |
| `delete_all_tasks` | Clears all tasks (requires explicit user request)    |

All tools use **Zod schemas** for input validation and return structured JSON that the client renders as **task cards** in the chat.

---

## Features

- **Chat-first**: All task management through natural language
- **Streaming responses**: Real-time token-by-token output via Vercel AI SDK
- **Structured tool cards**: Task operations render as visual cards in chat (created, updated, deleted, task lists)
- **Sidebar with filters**: All / Todo / Active / Done / Overdue
- **Inline task editing**: Click the edit button to edit title, priority, status, due date directly
- **Model selector**: Switch between GPT-4o-mini, GPT-4o, GPT-4.1-mini, GPT-4.1
- **Image upload**: Attach images for multimodal AI context
- **Dark/light mode**: Persisted in localStorage
- **Multi-step agent loop**: Handles bulk operations (e.g., "create 5 tasks")

---

## Getting Started

### Prerequisites

- Node.js 20+
- OpenAI API key

### Install & Run

```bash
git clone https://github.com/CohesivBucket/InterviewTestDU.git
cd InterviewTestDU

npm install

# Create .env.local with your OpenAI API key
echo "OPENAI_API_KEY=sk-..." > .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deviations from Spec

| Spec Requirement     | Implementation             | Rationale                                                                                      |
| -------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| TanStack Start       | Next.js 16 (App Router)   | TanStack Start v1 alpha had breaking module resolution issues with the AI SDK; Next.js is the most mature full-stack React framework with identical SSR/API route capabilities |
| SQLite / Drizzle     | In-memory Map store       | `better-sqlite3` (native C++ addon) cannot run on Vercel serverless. In-memory store provides identical CRUD API surface while being fully serverless-compatible |
| pnpm                 | npm                        | Both are package managers; npm is the Node.js default with zero additional setup required       |

**What IS implemented per spec:**
- Vercel AI SDK (`streamText`, `tool()`, `useChat`) for chat streaming + tool calling
- AI Elements (`@ai-sdk/react` `useChat` hook) for the chat UI
- TypeScript end-to-end (strict mode, no `any` leaks in public API)
- Chat displays tasks as structured cards (via ToolCard component rendering tool invocations)
- Real-time streaming responses
- 5 CRUD tool functions with Zod schema validation

---

## Acceptance Tests

| # | Test                                        | Steps                                                                                                     |
|---|---------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| 1 | **Create via chat**                         | Type "Add task Buy groceries high priority due tomorrow" - task appears in sidebar with correct priority/date |
| 2 | **Bulk create**                             | Type "Add 3 tasks: Walk dog, Clean house, Read book" - all 3 appear in sidebar                            |
| 3 | **Mark done via chat**                      | Type "Mark Buy groceries as done" - task shows DONE badge, moves to Done filter                           |
| 4 | **Inline edit from sidebar**                | Click edit on any task - change title/priority/status/due date - click Save - changes persist              |
| 5 | **Streaming + structured cards**            | Send any task command - response streams token-by-token, tool results render as colored task cards in chat |

---

## Scripts

```bash
npm run dev       # Start development server (localhost:3000)
npm run build     # Production build
npm run start     # Start production server
```

---

## Environment Variables

| Variable         | Required | Description          |
| ---------------- | -------- | -------------------- |
| `OPENAI_API_KEY` | Yes      | OpenAI API key       |
