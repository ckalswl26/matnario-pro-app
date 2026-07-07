import type { RestoreRequest, SimilarRecipe } from "./types";

function getKeyword(input: RestoreRequest) {
  const joined = `${input.memoryTitle} ${input.clues}`;
  const preferred = ["떡볶이", "잔치국수", "국수", "라면", "김치찌개", "된장찌개", "부대찌개", "카레", "스테이크", "볶음밥", "김밥", "돈까스", "미역국", "칼국수"];
  return preferred.find((word) => joined.includes(word)) || input.memoryTitle.split(/\s+/)[0] || "국수";
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function fetchFoodSafetyRecipes(input: RestoreRequest): Promise<SimilarRecipe[]> {
  const key = process.env.FOODSAFETY_API_KEY;
  if (!key) return [];

  const serviceId = process.env.FOODSAFETY_SERVICE_ID || "COOKRCP01";
  const keyword = encodeURIComponent(getKeyword(input));
  const url = `https://openapi.foodsafetykorea.go.kr/api/${key}/${serviceId}/json/1/20/RCP_NM=${keyword}`;

  try {
    const response = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
    if (!response.ok) return [];
    const data = await response.json();
    const rows = data?.[serviceId]?.row ?? [];

    return rows.slice(0, 5).map((row: Record<string, unknown>, index: number) => {
      const title = toText(row.RCP_NM) || `공공 레시피 ${index + 1}`;
      const ingredients = toText(row.RCP_PARTS_DTLS);
      const summary = [toText(row.RCP_PAT2), toText(row.RCP_WAY2), toText(row.HASH_TAG)]
        .filter(Boolean)
        .join(" · ") || "식품안전나라 조리식품 레시피 DB에서 가져온 레시피";
      return {
        id: `foodsafe-${toText(row.RCP_SEQ) || index}`,
        title,
        summary,
        ingredients,
        source: "foodsafe" as const,
        score: 80 - index,
        meta: [toText(row.RCP_PAT2), toText(row.RCP_WAY2), toText(row.INFO_ENG) ? `${toText(row.INFO_ENG)} kcal` : ""].filter(Boolean)
      };
    });
  } catch (error) {
    console.error("FoodSafety API failed", error);
    return [];
  }
}
