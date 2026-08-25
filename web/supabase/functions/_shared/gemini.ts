// Minimal Gemini client for Edge Functions — SERVER ONLY (reads GEMINI_API_KEY).
// Generates *verse references* only; the Amharic text always comes from the
// content API, never the model.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { book: { type: "INTEGER" }, chapter: { type: "INTEGER" }, verse: { type: "INTEGER" } },
    required: ["book", "chapter", "verse"],
  },
};

export type Ref = { book: number; chapter: number; verse: number };

export async function generateVerseRefs(count: number, exclude: Ref[] = []): Promise<Ref[]> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const excludeLine = exclude.length > 0
    ? `\nThese references were already used recently — do NOT repeat them: ${exclude.map((r) => `${r.book}:${r.chapter}:${r.verse}`).join(", ")}.`
    : "";

  const prompt = `You are curating uplifting daily Bible verses for an Amharic Bible app.
Return ${count} well-known, encouraging verse REFERENCES (do NOT write the verse text).
Use the Protestant 66-book order with these book NUMBERS:
1=Genesis … 19=Psalms, 20=Proverbs, 23=Isaiah, 40=Matthew, 43=John, 45=Romans,
50=Philippians … 66=Revelation.
Vary the books — pick from different books each time. Choose verses that are genuinely comforting, hopeful, or faith-building,
and that STAND ON THEIR OWN without needing surrounding context — avoid verses that are
misleading or wrongly understood when read in isolation.${excludeLine}
Return a JSON array of {"book":<1-66>,"chapter":<int>,"verse":<int>}.`;

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 1.0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  const refs = JSON.parse(text) as Ref[];
  return refs.filter((r) =>
    Number.isInteger(r.book) && r.book >= 1 && r.book <= 66 && r.chapter >= 1 && r.verse >= 1);
}
