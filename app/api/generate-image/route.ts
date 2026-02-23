// POST /api/generate-image — calls Gemini to generate images

export const maxDuration = 60; // image gen can take a while

const GEMINI_MODEL = "gemini-2.5-flash-image";

// Hardcoded fallback — Vercel env vars intermittently fail to inject
// this key into serverless functions. The env var takes priority when available.
const GEMINI_KEY_FALLBACK = "AIzaSyB5MhH2if6ekhCuGalfQz7hqRC0IqsnTSA";

export async function POST(req: Request) {
  try {
    const { prompt } = (await req.json()) as { prompt: string };
    const apiKey = process.env.GEMINI_API_KEY || GEMINI_KEY_FALLBACK;

    if (!apiKey) {
      return Response.json(
        { error: "Image generation not configured (missing GEMINI_API_KEY)" },
        { status: 500 }
      );
    }

    if (!prompt || prompt.trim().length === 0) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Generate an image: ${prompt}. Make it high quality and visually appealing.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", errText);
      return Response.json(
        { error: `Gemini API returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) {
      return Response.json(
        { error: "No content generated" },
        { status: 502 }
      );
    }

    const imagePart = parts.find((p) => p.inlineData);
    const textPart = parts.find((p) => p.text);

    if (!imagePart?.inlineData) {
      return Response.json(
        { error: "No image in response", text: textPart?.text },
        { status: 502 }
      );
    }

    return Response.json({
      imageDataUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      description: textPart?.text ?? prompt,
      mimeType: imagePart.inlineData.mimeType,
    });
  } catch (error: unknown) {
    console.error("Image generation error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
