/**
 * Minimal Gemini (Google Generative Language) client — SERVER ONLY.
 * Never import this into a client component; it reads GEMINI_API_KEY.
 */

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type JsonSchema = Record<string, unknown>;

/** Calls Gemini and returns the parsed JSON output (validated against `schema`). */
export async function generateJSON<T>(
  prompt: string,
  schema: JsonSchema,
): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 1.0,
      },
    }),
    // don't cache the model call itself; callers cache the result
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text) as T;
}
