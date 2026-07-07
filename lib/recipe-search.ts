import recipes from "../data/recipes.seed.json";
import type { RecipeSeed, RestoreRequest, SimilarRecipe } from "./types";

const seedRecipes = recipes as RecipeSeed[];

const STOPWORDS = new Set([
  "그리고",
  "그때",
  "같아요",
  "느낌",
  "음식",
  "맛이",
  "맛은",
  "먹던",
  "먹었던",
  "정도",
  "조금",
  "살짝",
  "있는",
  "없는",
  "아주",
  "너무",
  "진짜"
]);

const synonyms: Record<string, string[]> = {
  떡볶이: ["떡볶이", "떡", "어묵", "오뎅", "고추장", "분식", "학교"],
  국수: ["국수", "잔치국수", "소면", "멸치육수", "고명", "김가루"],
  잔치국수: ["잔치국수", "국수", "소면", "멸치육수", "고명"],
  라면: ["라면", "컵라면", "분말스프", "계란", "파", "김치"],
  카레: ["카레", "감자", "당근", "양파", "돼지고기", "일본식"],
  찌개: ["찌개", "김치찌개", "된장찌개", "부대찌개", "두부", "돼지고기"],
  스테이크: ["스테이크", "소고기", "버터", "후추", "로즈마리", "구이"],
  볶음밥: ["볶음밥", "밥", "계란", "파", "김치", "햄"],
  김밥: ["김밥", "김", "단무지", "햄", "시금치", "계란"],
  돈까스: ["돈까스", "돼지고기", "빵가루", "소스", "경양식"],
  매콤: ["매콤", "고추장", "고춧가루", "청양고추", "양념"],
  달달: ["달달", "설탕", "물엿", "올리고당", "케찹", "케첩"],
  고소: ["고소", "참기름", "들기름", "깨", "버터"],
  짭짤: ["짭짤", "간장", "소금", "된장", "액젓"],
  새콤: ["새콤", "식초", "초고추장", "레몬"],
  얼큰: ["얼큰", "고춧가루", "마늘", "대파", "국물"]
};

export function getSeedCount() {
  return seedRecipes.length;
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^가-힣a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string) {
  const normalized = normalize(input);
  const base = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));

  const expanded = new Set<string>();
  for (const token of base) {
    expanded.add(token);
    Object.entries(synonyms).forEach(([key, values]) => {
      if (token.includes(key) || values.some((value) => token.includes(value))) {
        values.forEach((value) => expanded.add(value));
        expanded.add(key);
      }
    });
  }

  return Array.from(expanded);
}

function scoreRecipe(recipe: RecipeSeed, tokens: string[], rawQuery: string) {
  const haystack = `${recipe.title} ${recipe.name} ${recipe.intro} ${recipe.ingredients} ${recipe.method} ${recipe.situation} ${recipe.kind} ${recipe.materialType} ${recipe.keywords.join(" ")}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (!token) continue;
    if (recipe.title.includes(token) || recipe.name.includes(token)) score += 14;
    if (recipe.ingredients.includes(token)) score += 7;
    if (recipe.intro.includes(token)) score += 5;
    if (recipe.keywords.includes(token)) score += 4;
    if (haystack.includes(token)) score += 2;
  }

  if (rawQuery.includes(recipe.name) || rawQuery.includes(recipe.title)) score += 18;
  if (recipe.situation === "간식" && rawQuery.includes("학교")) score += 10;
  if (recipe.situation === "야식" && rawQuery.includes("밤")) score += 6;
  if (recipe.method === "끓이기" && rawQuery.includes("국물")) score += 6;
  if (recipe.method === "볶음" && rawQuery.includes("볶")) score += 6;

  const popularity = Math.log10(Math.max(1, recipe.views + recipe.scraps * 10 + recipe.recommendations * 30));
  return score + popularity;
}

export function findSimilarRecipes(input: RestoreRequest, limit = 8): SimilarRecipe[] {
  const rawQuery = `${input.memoryTitle} ${input.place} ${input.time} ${input.clues} ${input.mood.join(" ")}`;
  const tokens = tokenize(rawQuery);
  const scored = seedRecipes
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, tokens, rawQuery) }))
    .filter((item) => item.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length > 0) {
    return scored.map(({ recipe, score }) => ({
      id: recipe.id,
      title: recipe.title || recipe.name,
      summary: recipe.intro || `${recipe.kind || "요리"} · ${recipe.method || "조리"} 기반 레시피`,
      ingredients: recipe.ingredients,
      source: "csv" as const,
      score: Math.round(score),
      meta: [recipe.kind, recipe.method, recipe.time, recipe.difficulty, recipe.serving].filter(Boolean)
    }));
  }

  return seedRecipes.slice(0, limit).map((recipe, index) => ({
    id: recipe.id,
    title: recipe.title || recipe.name,
    summary: recipe.intro || `${recipe.kind || "요리"} · ${recipe.method || "조리"} 기반 레시피`,
    ingredients: recipe.ingredients,
    source: "csv" as const,
    score: limit - index,
    meta: [recipe.kind, recipe.method, recipe.time, recipe.difficulty, recipe.serving].filter(Boolean)
  }));
}

export function extractIngredientCandidates(similar: SimilarRecipe[], max = 18) {
  const ingredientSet = new Map<string, number>();
  const noise = new Set(["재료", "양념", "선택", "약간", "적당량", "기호", "조금", "소량", "만큼"]);

  for (const recipe of similar) {
    const normalized = recipe.ingredients.replace(/[\[\]]/g, " ").replace(/[|·,]/g, " ");
    const chunks = normalized
      .split(/\s+/)
      .map((chunk) => chunk.replace(/[0-9./]+(g|kg|ml|l|큰술|작은술|개|장|컵|스푼|T|t)?/gi, "").trim())
      .filter((chunk) => chunk.length >= 2 && chunk.length <= 12 && !noise.has(chunk));
    chunks.forEach((chunk) => ingredientSet.set(chunk, (ingredientSet.get(chunk) ?? 0) + 1));
  }

  return Array.from(ingredientSet.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, max);
}
