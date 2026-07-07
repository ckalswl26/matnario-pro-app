import { NextResponse } from "next/server";
import { restoreRecipe } from "../../../../lib/restore-engine";
import type { RestoreRequest } from "../../../../lib/types";

export const runtime = "nodejs";

function validate(body: Partial<RestoreRequest>): RestoreRequest {
  const memoryTitle = String(body.memoryTitle || "").trim();
  const clues = String(body.clues || "").trim();

  if (!memoryTitle && !clues) {
    throw new Error("찾고 싶은 맛이나 맛 단서를 입력해주세요.");
  }

  return {
    memoryTitle: memoryTitle || "추억의 음식",
    place: String(body.place || "").trim(),
    time: String(body.time || "").trim(),
    clues,
    mood: Array.isArray(body.mood) ? body.mood.slice(0, 8) : []
  } as RestoreRequest;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = validate(body);
    const result = await restoreRecipe(input);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "레시피 복원 중 문제가 발생했어요.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
