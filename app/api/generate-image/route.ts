// POST /api/generate-image — calls OpenAI (gpt-image-1 / DALL-E 3) to generate images
// Uses the same OPENAI_API_KEY that powers the chat — no extra key needed.

export const maxDuration = 60; // image gen can take a while

export async function POST(req: Request) {
  try {
    const { prompt } = (await req.json()) as { prompt: string };
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Image generation not configured (missing OPENAI_API_KEY)" },
        { status: 500 },
      );
    }

    if (!prompt || prompt.trim().length === 0) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Try gpt-image-1 first (newer, better); fall back to dall-e-3
    const models = ["gpt-image-1", "dall-e-3"] as const;
    let lastError = "";

    for (const model of models) {
      // gpt-image-1 doesn't accept response_format; dall-e-3 does
      const body: Record<string, unknown> = {
        model,
        prompt: `${prompt}. Make it high quality and visually appealing.`,
        n: 1,
        size: "1024x1024",
      };
      if (model === "dall-e-3") {
        body.response_format = "b64_json";
      }

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
          data?: Array<{
            b64_json?: string;
            url?: string;
            revised_prompt?: string;
          }>;
        };

        const img = data.data?.[0];
        if (!img) {
          lastError = "No image in response";
          continue;
        }

        // Build data URL from base64
        const imageDataUrl = img.b64_json
          ? `data:image/png;base64,${img.b64_json}`
          : img.url ?? "";

        return Response.json({
          imageDataUrl,
          description: img.revised_prompt ?? prompt,
          mimeType: "image/png",
        });
      }

      // If model not found, try next
      const errBody = await res.text();
      console.error(`Image gen error (${model}):`, res.status, errBody);

      if (
        res.status === 404 ||
        errBody.includes("model_not_found") ||
        errBody.includes("Unknown parameter")
      ) {
        lastError = `${model} not available`;
        continue;
      }

      // For other errors (rate limit, auth, etc.), return immediately
      let errMsg: string;
      try {
        const parsed = JSON.parse(errBody);
        errMsg = parsed?.error?.message ?? `OpenAI API returned ${res.status}`;
      } catch {
        errMsg = `OpenAI API returned ${res.status}`;
      }
      return Response.json({ error: errMsg }, { status: 502 });
    }

    return Response.json(
      { error: lastError || "Image generation failed" },
      { status: 502 },
    );
  } catch (error: unknown) {
    console.error("Image generation error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
