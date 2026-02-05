import { extractFacts } from "@/lib/facts";
import { analyzeWithOpenAi } from "@/lib/openai";

type AnalyzeRequest = {
  text?: string;
};

export async function POST(request: Request): Promise<Response> {
  let payload: AnalyzeRequest;
  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    return Response.json(
      { error: "Неверный формат запроса." },
      { status: 400 },
    );
  }

  const text = payload.text?.trim();
  if (!text) {
    return Response.json(
      { error: "Введите текст для анализа." },
      { status: 400 },
    );
  }

  try {
    const facts = extractFacts(text);
    const analysis = await analyzeWithOpenAi(text, facts);
    return Response.json({ analysis });
  } catch (error) {
    console.error("Mini app analysis failed", error);
    return Response.json(
      { error: "Не удалось выполнить анализ." },
      { status: 500 },
    );
  }
}
