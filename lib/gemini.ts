import type { RestoreRequest, RestoreResult, SimilarRecipe } from "./types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function safeJsonParse(text: string) {
  const cleaned = text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Gemini response did not contain JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function buildPrompt(input: RestoreRequest, similarRecipes: SimilarRecipe[]) {
  const references = similarRecipes.slice(0, 6).map((recipe, index) => ({
    rank: index + 1,
    title: recipe.title,
    summary: recipe.summary,
    ingredients: recipe.ingredients.slice(0, 420),
    source: recipe.source
  }));

  return `너는 추억의 맛 복원 앱 "맛나리오"의 AI 셰프다. 사용자의 기억 단서를 실제로 조리 가능한 레시피로 복원한다.

원칙:
- 아래 참고 레시피를 근거로 재료와 조리 방식을 추론한다.
- 반드시 1인분 기준으로 작성한다.
- 재료에는 g, ml, 개, 장, 큰술, 작은술, 꼬집처럼 실제 계량을 반드시 포함한다.
- “적당량”, “약간”, “기호껏”, “취향껏” 같은 추상 표현은 재료 목록에 절대 쓰지 않는다.
- 조리 단계에는 불 세기와 시간(예: 중불 5분)을 최대한 포함한다.
- 과장된 치료, 건강 효능 표현은 쓰지 않는다.
- 식품 알레르기 가능성이 있는 재료는 팁에서 확인하도록 안내한다.
- 답변은 반드시 JSON 하나만 반환한다. 마크다운 코드블록 금지.
- 결과는 한국어로 작성한다.

사용자 기억:
${JSON.stringify(input, null, 2)}

참고 레시피 후보:
${JSON.stringify(references, null, 2)}

반환 JSON 스키마:
{
  "title": "복원 레시피 이름",
  "subtitle": "한 줄 설명",
  "confidence": 0부터 100 사이 숫자,
  "tasteTags": ["태그", "태그", "태그", "태그"],
  "story": "왜 이 레시피가 사용자의 기억에 가까운지 따뜻하게 설명",
  "ingredients": ["떡볶이떡 150g", "고추장 1큰술(18g)", "물 220ml"],
  "steps": ["중불에서 5분 끓인다처럼 시간과 불 세기를 포함한 조리 단계 1", "조리 단계 2", "조리 단계 3", "조리 단계 4"],
  "tips": ["맛 조정 팁", "알레르기/대체재 팁"]
}`;
}

export async function generateWithGemini(input: RestoreRequest, similarRecipes: SimilarRecipe[]): Promise<Partial<RestoreResult> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(input, similarRecipes) }]
      }
    ],
    generationConfig: {
      temperature: 0.35,
      topP: 0.9,
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error("Gemini API error", await response.text());
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return safeJsonParse(text);
  } catch (error) {
    console.error("Gemini generation failed", error);
    return null;
  }
}
