import { ai, MODEL } from "@/lib/ai";

export async function GET() {
  try {
    const res = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "user", content: "Greet a fabric shop customer in one short sentence." },
      ],
    });
    return Response.json({ reply: res.choices[0]?.message?.content });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}