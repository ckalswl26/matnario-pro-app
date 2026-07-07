import type { RestoreRequest, RestoreResult, SimilarRecipe } from "./types";
import { extractIngredientCandidates, findSimilarRecipes, getSeedCount } from "./recipe-search";
import { fetchFoodSafetyRecipes } from "./foodsafe";
import { generateWithGemini } from "./gemini";

type DishKind = "tteokbokki" | "noodle" | "ramen" | "steak" | "stew" | "curry" | "friedRice" | "default";

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(number)) return 74;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function cleanList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item).trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function inferDishKind(input: RestoreRequest, similar: SimilarRecipe[]): DishKind {
  const query = `${input.memoryTitle} ${input.place} ${input.time} ${input.clues} ${input.mood.join(" ")} ${similar.map((recipe) => recipe.title).join(" ")}`;
  if (/떡볶이|분식|어묵|오뎅|고추장/.test(query)) return "tteokbokki";
  if (/잔치국수|국수|소면|멸치육수|고명|냉면|칼국수/.test(query)) return "noodle";
  if (/라면|컵라면|PX|피엑스/.test(query)) return "ramen";
  if (/스테이크|경양식|소고기|버터|후추|로즈마리/.test(query)) return "steak";
  if (/찌개|부대찌개|김치찌개|된장찌개|전골/.test(query)) return "stew";
  if (/카레|커리/.test(query)) return "curry";
  if (/볶음밥|김치볶음밥|밥/.test(query)) return "friedRice";
  return "default";
}

function inferBaseTitle(input: RestoreRequest, similar: SimilarRecipe[]) {
  const target = input.memoryTitle.trim();
  if (target) return `${target} 1인분 복원 레시피`;
  const first = similar[0]?.title?.replace(/\s*만드는법.*$/g, "").replace(/\s*레시피.*$/g, "").trim();
  return first ? `${first} 1인분 맛나리오` : "추억의 한 접시 1인분";
}

function inferTags(input: RestoreRequest, similar: SimilarRecipe[]) {
  const tags = new Set<string>();
  input.mood.forEach((mood) => tags.add(mood));
  const query = `${input.memoryTitle} ${input.clues} ${similar.map((recipe) => recipe.title).join(" ")}`;
  if (query.includes("떡볶이") || query.includes("분식")) tags.add("분식");
  if (query.includes("국수") || query.includes("육수")) tags.add("멸치육수");
  if (query.includes("라면")) tags.add("라면맛");
  if (query.includes("카레")) tags.add("카레향");
  if (query.includes("스테이크")) tags.add("버터향");
  if (query.includes("학교")) tags.add("학교앞");
  if (query.includes("할머니") || query.includes("엄마")) tags.add("집밥");
  tags.add("1인분");
  return Array.from(tags).slice(0, 6);
}

function includesAny(input: RestoreRequest, words: string[]) {
  const query = `${input.memoryTitle} ${input.clues} ${input.mood.join(" ")}`;
  return words.some((word) => query.includes(word));
}

function preciseTemplate(kind: DishKind, input: RestoreRequest) {
  const wantsCurry = includesAny(input, ["카레", "커리"]);
  const wantsSweet = includesAny(input, ["달달", "달콤", "단맛"]);
  const wantsSpicy = includesAny(input, ["매콤", "얼큰", "매운", "칼칼"]);
  const wantsSavory = includesAny(input, ["고소", "버터", "참기름"]);

  if (kind === "tteokbokki") {
    const gochugaru = wantsSpicy ? "고춧가루 1작은술(3g)" : "고춧가루 1/2작은술(1.5g)";
    const sugar = wantsSweet ? "설탕 1큰술(12g)" : "설탕 2작은술(8g)";
    const curry = wantsCurry ? ["카레가루 1/2작은술(1g)"] : [];
    return {
      subtitle: "쫀득한 떡과 달달매콤한 분식집 소스를 1인분 기준으로 복원했어요.",
      ingredients: [
        "떡볶이떡 150g",
        "사각어묵 1장(45g)",
        "대파 20g",
        "물 220ml",
        "고추장 1큰술(18g)",
        gochugaru,
        sugar,
        "진간장 1작은술(5ml)",
        "물엿 또는 올리고당 1작은술(7g)",
        ...curry,
        "삶은 달걀 1/2개(선택)",
        "통깨 1/2작은술"
      ],
      steps: [
        "떡볶이떡 150g은 흐르는 물에 헹구고 딱딱하면 미지근한 물에 10분 불려요.",
        "냄비에 물 220ml, 고추장 18g, 고춧가루, 설탕, 진간장, 물엿을 넣고 중불에서 1분 풀어 끓여요.",
        wantsCurry ? "소스가 끓으면 카레가루 1g을 넣고 덩어리 없이 풀어 학교 앞 분식집 같은 향을 만들어요." : "소스가 끓으면 떡과 어묵을 넣고 중불을 유지해요.",
        "떡 150g과 어묵 45g을 넣고 5~6분 저어가며 끓여 소스가 숟가락에 묻을 정도로 졸여요.",
        "대파 20g을 넣고 30초 더 끓인 뒤 불을 끄고 통깨와 달걀을 올려 마무리해요."
      ],
      tips: [
        "더 달달한 학교 앞 맛은 설탕을 1작은술 추가하고, 더 매콤한 맛은 고춧가루를 1/2작은술만 추가하세요.",
        "소스가 너무 빨리 졸면 물 30ml를 추가하고 1분 더 끓이면 떡 안쪽까지 부드러워져요."
      ]
    };
  }

  if (kind === "noodle") {
    return {
      subtitle: "멸치육수 향과 고명이 또렷한 따뜻한 국수 1인분이에요.",
      ingredients: [
        "소면 90g",
        "물 600ml",
        "국물용 멸치 10g",
        "다시마 3x4cm 1장",
        "국간장 1작은술(5ml)",
        "소금 1/4작은술(1.5g)",
        "애호박 35g",
        "달걀 1개",
        "김가루 1큰술",
        "대파 10g",
        "참기름 1/2작은술(2.5ml)",
        "깨 1/2작은술"
      ],
      steps: [
        "냄비에 물 600ml, 멸치 10g, 다시마 1장을 넣고 중불에서 8분 끓인 뒤 건더기를 건져요.",
        "육수에 국간장 5ml와 소금 1.5g을 넣고 간을 맞춘 뒤 약불로 따뜻하게 유지해요.",
        "소면 90g은 끓는 물에 3분 30초 삶고 찬물에 2번 헹궈 전분기를 빼요.",
        "달걀 1개는 지단으로 부쳐 채 썰고, 애호박 35g은 소금 한 꼬집과 함께 1분 볶아요.",
        "그릇에 면을 담고 뜨거운 육수 350ml를 부은 뒤 지단, 애호박, 김가루, 대파, 참기름, 깨를 올려요."
      ],
      tips: [
        "할머니 국수처럼 부드럽게 먹고 싶으면 소면을 20초 더 삶고, 육수는 간장을 줄이고 소금으로 맞추세요.",
        "김가루와 참기름은 먹기 직전에 올려야 고소한 향이 살아나요."
      ]
    };
  }

  if (kind === "ramen") {
    return {
      subtitle: "짭짤하고 얼큰한 컵라면 추억을 냄비 1인분으로 복원했어요.",
      ingredients: [
        "라면 1봉",
        "물 500ml",
        "달걀 1개",
        "대파 20g",
        "김치 40g",
        "참치 30g(선택)",
        "고춧가루 1/2작은술(1.5g)",
        "후추 2꼬집",
        "김가루 1큰술"
      ],
      steps: [
        "물 500ml를 끓이고 분말스프 전량과 고춧가루 1.5g을 넣어요.",
        "면을 넣고 2분 끓인 뒤 김치 40g과 대파 20g을 넣어요.",
        "달걀 1개를 넣고 노른자가 살짝 익도록 1분 20초 더 끓여요.",
        "참치 30g을 넣는다면 마지막 20초에 넣어 비린 맛 없이 데워요.",
        "그릇에 담고 후추 2꼬집과 김가루 1큰술을 올려요."
      ],
      tips: [
        "PX 라면처럼 짭짤하게 느끼고 싶으면 물을 470ml로 줄이고, 덜 짜게 먹으려면 스프를 85%만 넣으세요.",
        "참치와 달걀을 모두 넣으면 국물이 탁해질 수 있어서 마지막 1분은 센 불보다 중불이 좋아요."
      ]
    };
  }

  if (kind === "steak") {
    return {
      subtitle: "버터와 후추 향이 강한 경양식풍 스테이크 1인분이에요.",
      ingredients: [
        "소고기 스테이크용 180g",
        "소금 1/3작은술(2g)",
        "굵은 후추 1/2작은술(1g)",
        "식용유 1큰술(15ml)",
        "버터 15g",
        "마늘 2쪽(10g)",
        "로즈마리 1줄기(선택)",
        "돈가스소스 2큰술(30ml)",
        "케첩 1큰술(15g)",
        "물 2큰술(30ml)",
        "설탕 1/2작은술(2g)",
        "삶은 감자 80g 또는 감자샐러드 1스쿱"
      ],
      steps: [
        "소고기 180g은 키친타월로 물기를 닦고 소금 2g, 후추 1g을 앞뒤로 뿌려 10분 둬요.",
        "팬을 중강불로 1분 30초 예열하고 식용유 15ml를 두른 뒤 고기를 한 면당 2분씩 구워요.",
        "버터 15g, 마늘 2쪽, 로즈마리를 넣고 녹은 버터를 고기에 1분 끼얹어요.",
        "고기를 접시에 빼 5분 쉬게 하고, 같은 팬에 돈가스소스 30ml, 케첩 15g, 물 30ml, 설탕 2g을 넣고 1분 졸여요.",
        "고기에 소스를 뿌리고 감자샐러드나 삶은 감자를 곁들여요."
      ],
      tips: [
        "경양식집 느낌은 후추를 충분히 쓰고, 소스에 케첩을 넣어 살짝 달달하게 만드는 게 핵심이에요.",
        "웰던을 원하면 각 면을 1분씩 더 굽고, 미디엄은 위 시간 그대로가 좋아요."
      ]
    };
  }

  if (kind === "stew") {
    return {
      subtitle: "국물 맛이 선명한 1인분 찌개 복원 레시피예요.",
      ingredients: [
        "물 또는 육수 350ml",
        "김치 또는 주재료 120g",
        "돼지고기 또는 햄 60g",
        "두부 80g",
        "대파 20g",
        "양파 40g",
        "고춧가루 1작은술(3g)",
        "다진 마늘 1작은술(5g)",
        "국간장 1작은술(5ml)",
        "참치액 또는 멸치액젓 1/2작은술(2.5ml)",
        "설탕 1/3작은술(1g)"
      ],
      steps: [
        "냄비에 고기 60g과 김치 또는 주재료 120g을 넣고 중불에서 2분 볶아요.",
        "고춧가루 3g, 다진 마늘 5g을 넣고 30초 더 볶아 향을 내요.",
        "물 또는 육수 350ml를 붓고 국간장 5ml, 액젓 2.5ml, 설탕 1g을 넣어 7분 끓여요.",
        "두부 80g, 양파 40g, 대파 20g을 넣고 3분 더 끓여요.",
        "간을 보고 싱거우면 소금 한 꼬집, 짜면 물 30ml를 추가해 맞춰요."
      ],
      tips: [
        "오래 끓인 집밥 느낌은 처음 2분 볶는 과정을 생략하지 않는 것이 좋아요.",
        "국물 요리는 마지막 간이 중요해서 소금은 반드시 마지막에 조금씩 넣어보세요."
      ]
    };
  }

  if (kind === "curry") {
    return {
      subtitle: "부드럽고 익숙한 카레 향을 살린 1인분 레시피예요.",
      ingredients: [
        "밥 1공기(200g)",
        "카레가루 25g",
        "물 260ml",
        "감자 70g",
        "양파 70g",
        "당근 35g",
        "돼지고기 또는 닭고기 70g",
        "식용유 1작은술(5ml)",
        "버터 5g(선택)",
        "후추 1꼬집"
      ],
      steps: [
        "감자 70g, 양파 70g, 당근 35g, 고기 70g을 한입 크기로 썰어요.",
        "냄비에 식용유 5ml를 두르고 고기를 2분 볶다가 채소를 넣고 3분 더 볶아요.",
        "물 260ml를 붓고 감자가 부드러워질 때까지 중불에서 8분 끓여요.",
        "불을 약하게 줄이고 카레가루 25g을 넣어 2분 저어가며 풀어요.",
        "버터 5g과 후추를 넣고 밥 200g 위에 부어 마무리해요."
      ],
      tips: [
        "분식집 카레 느낌은 버터보다 설탕 한 꼬집을 넣으면 더 가까워져요.",
        "걸쭉하면 물 30ml, 묽으면 1분 더 끓여 농도를 맞추세요."
      ]
    };
  }

  if (kind === "friedRice") {
    return {
      subtitle: "고슬고슬한 밥과 향이 살아 있는 1인분 볶음밥이에요.",
      ingredients: [
        "찬밥 200g",
        "달걀 1개",
        "대파 25g",
        "식용유 1큰술(15ml)",
        "간장 1작은술(5ml)",
        "소금 1/4작은술(1.5g)",
        "후추 2꼬집",
        "참기름 1/2작은술(2.5ml)",
        "김가루 1큰술"
      ],
      steps: [
        "팬에 식용유 15ml와 대파 25g을 넣고 중불에서 1분 볶아 파기름을 만들어요.",
        "달걀 1개를 넣고 70% 정도 익을 때까지 젓가락으로 풀어요.",
        "찬밥 200g을 넣고 주걱으로 눌러가며 2분 볶아요.",
        "팬 가장자리에 간장 5ml를 둘러 10초 태우듯 향을 낸 뒤 밥과 섞어요.",
        "소금, 후추, 참기름, 김가루를 넣고 30초 더 볶아 마무리해요."
      ],
      tips: [
        "찬밥을 쓰면 질척하지 않고, 즉석밥은 전자레인지에 40초만 데워 수분을 줄이면 좋아요.",
        "간장은 밥 위가 아니라 팬 가장자리에 넣어야 불향이 납니다."
      ]
    };
  }

  const savoryOil = wantsSavory ? "참기름 1작은술(5ml)" : "참기름 1/2작은술(2.5ml)";
  return {
    subtitle: "유사 레시피와 기억 단서를 바탕으로 만든 기본 1인분 복원 레시피예요.",
    ingredients: [
      "주재료 160g",
      "양파 50g",
      "대파 20g",
      "다진 마늘 1작은술(5g)",
      "진간장 1큰술(15ml)",
      "설탕 1작은술(4g)",
      wantsSpicy ? "고춧가루 1작은술(3g)" : "후추 2꼬집",
      savoryOil,
      "물 또는 육수 120ml",
      "깨 1/2작은술"
    ],
    steps: [
      "주재료 160g과 채소는 한입 크기로 썰고, 양념은 미리 계량해요.",
      "팬이나 냄비에 기름을 두르고 대파 20g, 마늘 5g을 중불에서 1분 볶아요.",
      "주재료와 양파를 넣고 3분 볶은 뒤 간장, 설탕, 물 또는 육수를 넣어요.",
      "중불에서 5분 조리해 간이 배면 마지막에 참기름과 깨를 넣어요.",
      "맛을 보고 단맛은 설탕 1/2작은술, 짠맛은 간장 1/2작은술 단위로 조절해요."
    ],
    tips: [
      "기억 단서에 특정 재료가 있다면 주재료 160g 안에 그 재료를 우선 배치하세요.",
      "더 정확한 복원을 위해 색, 냄새, 식감, 같이 먹은 반찬을 추가로 입력하면 좋아요."
    ]
  };
}

function mergeReferenceIngredients(base: string[], candidates: string[], kind: DishKind) {
  const result = [...base];
  const existingNames = result.join(" ");
  const allowedExtra = candidates
    .filter((name) => name.length >= 2)
    .filter((name) => !existingNames.includes(name))
    .filter((name) => !/(적당량|약간|기호|재료|양념|선택)/.test(name))
    .slice(0, 3);

  const unitByKind: Record<DishKind, string> = {
    tteokbokki: "10g",
    noodle: "10g",
    ramen: "10g",
    steak: "15g",
    stew: "20g",
    curry: "20g",
    friedRice: "15g",
    default: "15g"
  };

  for (const name of allowedExtra) {
    result.push(`${name} ${unitByKind[kind]}(기억 단서 반영용)`);
  }
  return result.slice(0, 15);
}

function buildLocalResult(input: RestoreRequest, similar: SimilarRecipe[]): RestoreResult {
  const kind = inferDishKind(input, similar);
  const template = preciseTemplate(kind, input);
  const candidates = extractIngredientCandidates(similar);
  const tags = inferTags(input, similar);
  const top = similar[0];
  const title = inferBaseTitle(input, similar);

  const sourceTitles = similar.slice(0, 3).map((recipe) => recipe.title).join(", ");
  const confidence = Math.min(91, Math.max(64, 60 + similar.length * 3 + input.mood.length * 2));

  return {
    title,
    subtitle: template.subtitle,
    confidence,
    tasteTags: tags,
    story: top
      ? `입력한 기억 단서를 ${sourceTitles} 같은 유사 레시피와 비교했어요. ${input.place ? `${input.place}에서 먹었던 분위기` : "그때의 분위기"}를 살리되, 실제로 바로 조리할 수 있도록 1인분 기준의 g/ml/큰술 단위로 재구성했어요.`
      : "아직 단서가 적어서 기본 조리 흐름으로 복원했어요. 그래도 바로 만들어볼 수 있도록 1인분 기준 계량으로 정리했어요.",
    ingredients: mergeReferenceIngredients(template.ingredients, candidates, kind),
    steps: template.steps,
    tips: template.tips,
    sourceNote: `CSV seed ${getSeedCount().toLocaleString("ko-KR")}개${similar.some((recipe) => recipe.source === "foodsafe") ? " + 식품안전나라 Open API" : ""} 기반으로 검색했어요. Gemini API 키가 없거나 실패하면 1인분 계량 로컬 엔진으로 생성돼요.`,
    similarRecipes: similar
  };
}

function ensurePreciseServing(result: Partial<RestoreResult>, fallback: RestoreResult): RestoreResult {
  const ingredients = cleanList(result.ingredients, fallback.ingredients);
  const hasMeasurement = ingredients.filter((item) => /\d|큰술|작은술|컵|ml|g|개|장|꼬집|공기|봉/.test(item)).length >= Math.min(3, ingredients.length);
  const hasBadVague = ingredients.some((item) => /적당량|약간|기호껏|취향껏/.test(item));

  return {
    ...fallback,
    title: typeof result.title === "string" && result.title.trim() ? result.title : fallback.title,
    subtitle: typeof result.subtitle === "string" && result.subtitle.trim() ? result.subtitle : fallback.subtitle,
    confidence: clampConfidence(result.confidence ?? fallback.confidence),
    tasteTags: cleanList(result.tasteTags, fallback.tasteTags).slice(0, 6),
    story: typeof result.story === "string" && result.story.trim() ? result.story : fallback.story,
    ingredients: hasMeasurement && !hasBadVague ? ingredients : fallback.ingredients,
    steps: cleanList(result.steps, fallback.steps),
    tips: cleanList(result.tips, fallback.tips),
    similarRecipes: fallback.similarRecipes,
    sourceNote: fallback.sourceNote
  };
}

export async function restoreRecipe(input: RestoreRequest): Promise<RestoreResult> {
  const csvRecipes = findSimilarRecipes(input, 8);
  const publicRecipes = await fetchFoodSafetyRecipes(input);
  const combined = [...publicRecipes, ...csvRecipes]
    .filter((recipe, index, array) => array.findIndex((item) => item.title === recipe.title) === index)
    .slice(0, 10);

  const local = buildLocalResult(input, combined);
  const gemini = await generateWithGemini(input, combined);

  if (!gemini) return local;

  return ensurePreciseServing(
    {
      ...gemini,
      sourceNote: `CSV seed ${getSeedCount().toLocaleString("ko-KR")}개${publicRecipes.length ? " + 식품안전나라 Open API" : ""}를 검색한 뒤 Gemini가 1인분 계량 레시피를 생성했어요.`
    },
    {
      ...local,
      sourceNote: `CSV seed ${getSeedCount().toLocaleString("ko-KR")}개${publicRecipes.length ? " + 식품안전나라 Open API" : ""}를 검색한 뒤 Gemini가 1인분 계량 레시피를 생성했어요.`
    }
  );
}
