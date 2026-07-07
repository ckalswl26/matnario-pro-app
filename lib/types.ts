export type MemoryMood = "달달" | "매콤" | "고소" | "짭짤" | "담백" | "추억" | "얼큰" | "새콤";

export type RestoreRequest = {
  memoryTitle: string;
  place: string;
  time: string;
  clues: string;
  mood: MemoryMood[];
};

export type RecipeSeed = {
  id: string;
  title: string;
  name: string;
  intro: string;
  ingredients: string;
  serving: string;
  difficulty: string;
  time: string;
  method: string;
  situation: string;
  materialType: string;
  kind: string;
  views: number;
  recommendations: number;
  scraps: number;
  keywords: string[];
};

export type SimilarRecipe = {
  id: string;
  title: string;
  summary: string;
  ingredients: string;
  source: "csv" | "foodsafe";
  score: number;
  meta: string[];
};

export type RestoreResult = {
  title: string;
  subtitle: string;
  confidence: number;
  tasteTags: string[];
  story: string;
  ingredients: string[];
  steps: string[];
  tips: string[];
  sourceNote: string;
  similarRecipes: SimilarRecipe[];
};
