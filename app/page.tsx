"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Mood = "달달" | "매콤" | "고소" | "짭짤" | "담백" | "추억" | "얼큰" | "새콤";

type RestoreForm = {
  memoryTitle: string;
  place: string;
  time: string;
  clues: string;
  mood: Mood[];
};

type SimilarRecipe = {
  id: string;
  title: string;
  summary: string;
  ingredients: string;
  source: "csv" | "foodsafe";
  score: number;
  meta: string[];
};

type RestoreResult = {
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

type HistoryItem = {
  id: string;
  createdAt: string;
  form: RestoreForm;
  result: RestoreResult;
  feedback?: "match" | "different";
};

type Profile = {
  nickname: string;
  photo: string;
  bio: string;
};

type CommunityPost = {
  id: string;
  createdAt: string;
  author: string;
  avatar: string;
  title: string;
  body: string;
  image?: string;
  recipeTitle?: string;
  tags: string[];
  likes: number;
  comments: number;
};

type View = "home" | "loading" | "result" | "community" | "history" | "profile";

const moodOptions: Mood[] = ["달달", "매콤", "고소", "짭짤", "담백", "추억", "얼큰", "새콤"];

const examples: RestoreForm[] = [
  {
    memoryTitle: "학교 앞 카레 떡볶이",
    place: "초등학교 정문 앞 분식집",
    time: "1999년쯤, 하교 후",
    clues: "떡볶이에 어묵이 많고 카레 향이 살짝 났어요. 소스는 묽지 않고 달달하면서 매콤했어요.",
    mood: ["달달", "매콤", "추억"]
  },
  {
    memoryTitle: "할머니 잔치국수",
    place: "시골집 마당",
    time: "여름 방학 점심",
    clues: "멸치육수 향이 진하고 계란지단, 애호박, 김가루가 올라갔어요. 국물은 맑고 따뜻했어요.",
    mood: ["담백", "고소", "추억"]
  },
  {
    memoryTitle: "군대 PX 라면",
    place: "생활관",
    time: "비 오는 야간 근무 후",
    clues: "컵라면에 계란과 참치 조금, 김치를 넣은 것 같고 국물이 얼큰하고 짭짤했어요.",
    mood: ["얼큰", "짭짤", "추억"]
  },
  {
    memoryTitle: "첫 데이트 스테이크",
    place: "작은 경양식집",
    time: "겨울 저녁",
    clues: "버터 향이 나고 후추가 강했어요. 달달한 소스와 옥수수, 감자 샐러드가 같이 있었어요.",
    mood: ["고소", "달달", "추억"]
  }
];

const loadingMessages = [
  "기억 단서를 한 숟갈씩 읽는 중...",
  "레시피 DB에서 비슷한 맛을 찾는 중...",
  "1인분 계량을 정확히 맞추는 중...",
  "레시피 마스코트가 마지막 간을 보는 중..."
];

const initialForm: RestoreForm = {
  memoryTitle: "",
  place: "",
  time: "",
  clues: "",
  mood: ["추억"]
};

const defaultProfile: Profile = {
  nickname: "맛나리오 손님",
  photo: "",
  bio: "기억 속 맛을 찾는 중이에요."
};

const defaultPosts: CommunityPost[] = [
  {
    id: "seed-community-1",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    author: "분식집탐정",
    avatar: "",
    title: "혹시 2000년대 초 부산 초등학교 앞 카레 떡볶이 기억하시는 분?",
    body: "소스가 좀 걸쭉하고 카레 향이 났는데, 어묵이 얇게 많이 들어갔어요. 제가 복원한 레시피는 고추장 1큰술에 카레가루 1/2작은술이 핵심이었어요.",
    recipeTitle: "학교 앞 카레 떡볶이",
    tags: ["떡볶이", "학교앞", "카레향"],
    likes: 18,
    comments: 7
  },
  {
    id: "seed-community-2",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    author: "국수그릇",
    avatar: "",
    title: "할머니 잔치국수는 멸치보다 다시마가 중요했네요",
    body: "같은 식당은 아니지만 비슷한 맛 찾으시는 분들 참고하세요. 멸치 10g, 다시마 작은 1장, 국간장 1작은술이 제일 근접했어요.",
    recipeTitle: "할머니 잔치국수",
    tags: ["잔치국수", "멸치육수", "집밥"],
    likes: 31,
    comments: 12
  }
];

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function pickFoodAsset(title: string) {
  if (/떡볶이|분식|어묵|오뎅/.test(title)) return "/assets/food-tteokbokki.png";
  if (/국수|냉면|면|라면|칼국수/.test(title)) return "/assets/food-noodle.png";
  if (/스테이크|고기|소고기|구이/.test(title)) return "/assets/food-steak.png";
  return "/assets/mascot-recipe.png";
}

function photoFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [form, setForm] = useState<RestoreForm>(initialForm);
  const [view, setView] = useState<View>("home");
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(defaultPosts);
  const [communityDraft, setCommunityDraft] = useState({ title: "", body: "", image: "" });
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => Boolean(form.memoryTitle.trim() || form.clues.trim()), [form.memoryTitle, form.clues]);
  const currentFeedback = history.find((item) => item.id === currentHistoryId)?.feedback;

  useEffect(() => {
    setHistory(readStorage<HistoryItem[]>("matnario.history", []));
    setProfile(readStorage<Profile>("matnario.profile", defaultProfile));
    setCommunityPosts(readStorage<CommunityPost[]>("matnario.community", defaultPosts));
  }, []);

  useEffect(() => {
    if (view !== "loading") return;
    const timer = window.setInterval(() => {
      setActiveStep((prev) => (prev + 1) % loadingMessages.length);
    }, 1050);
    return () => window.clearInterval(timer);
  }, [view]);

  const saveHistory = (next: HistoryItem[]) => {
    setHistory(next);
    writeStorage("matnario.history", next);
  };

  const saveCommunity = (next: CommunityPost[]) => {
    setCommunityPosts(next);
    writeStorage("matnario.community", next);
  };

  const saveProfile = (next: Profile) => {
    setProfile(next);
    writeStorage("matnario.profile", next);
  };

  const updateField = (key: keyof RestoreForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleMood = (mood: Mood) => {
    setForm((prev) => {
      const exists = prev.mood.includes(mood);
      return {
        ...prev,
        mood: exists ? prev.mood.filter((item) => item !== mood) : [...prev.mood, mood]
      };
    });
  };

  const applyExample = (example: RestoreForm) => {
    setForm(example);
    setError("");
    setView("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setError("찾고 싶은 맛 이름이나 기억 단서를 하나만이라도 적어주세요.");
      return;
    }

    setError("");
    setFeedbackMessage("");
    setResult(null);
    setActiveStep(0);
    setView("loading");

    try {
      const response = await fetch("/api/recipes/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "맛 복원에 실패했어요.");

      const restored = data as RestoreResult;
      const id = makeId("history");
      const nextItem: HistoryItem = {
        id,
        createdAt: new Date().toISOString(),
        form,
        result: restored
      };

      setResult(restored);
      setCurrentHistoryId(id);
      saveHistory([nextItem, ...history].slice(0, 80));
      setView("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "맛 복원에 실패했어요.");
      setView("home");
    }
  };

  const leaveFeedback = (feedback: "match" | "different") => {
    if (!currentHistoryId) return;
    const next = history.map((item) => (item.id === currentHistoryId ? { ...item, feedback } : item));
    saveHistory(next);
    setFeedbackMessage(feedback === "match" ? "좋아요! 이 맛으로 기록해둘게요." : "알겠어요. 다음 복원 때 더 정확히 맞출 수 있게 기록했어요.");
  };

  const openHistoryItem = (item: HistoryItem) => {
    setForm(item.form);
    setResult(item.result);
    setCurrentHistoryId(item.id);
    setFeedbackMessage("");
    setView("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeHistoryItem = (id: string) => {
    saveHistory(history.filter((item) => item.id !== id));
  };

  const shareResultToCommunity = () => {
    if (!result) return;
    const post: CommunityPost = {
      id: makeId("post"),
      createdAt: new Date().toISOString(),
      author: profile.nickname || defaultProfile.nickname,
      avatar: profile.photo,
      title: `${result.title} 공유해요`,
      body: `${result.story}\n\n핵심 재료: ${result.ingredients.slice(0, 5).join(", ")}`,
      recipeTitle: result.title,
      tags: result.tasteTags.slice(0, 4),
      likes: 0,
      comments: 0
    };
    saveCommunity([post, ...communityPosts]);
    setView("community");
  };

  const submitCommunityPost = (event: FormEvent) => {
    event.preventDefault();
    if (!communityDraft.title.trim() || !communityDraft.body.trim()) return;
    const post: CommunityPost = {
      id: makeId("post"),
      createdAt: new Date().toISOString(),
      author: profile.nickname || defaultProfile.nickname,
      avatar: profile.photo,
      title: communityDraft.title.trim(),
      body: communityDraft.body.trim(),
      image: communityDraft.image,
      tags: ["맛기억", "레시피공유"],
      likes: 0,
      comments: 0
    };
    saveCommunity([post, ...communityPosts]);
    setCommunityDraft({ title: "", body: "", image: "" });
  };

  const handleCommunityPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const image = await photoFromFile(file);
    setCommunityDraft((prev) => ({ ...prev, image }));
  };

  const handleProfilePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const photo = await photoFromFile(file);
    saveProfile({ ...profile, photo });
  };

  const likePost = (id: string) => {
    saveCommunity(communityPosts.map((post) => (post.id === id ? { ...post, likes: post.likes + 1 } : post)));
  };

  return (
    <main className="app-shell">
      <div className="phone-frame">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <header className="topbar">
          <button type="button" className="brand-button" onClick={() => setView("home")} aria-label="홈으로 이동">
            <p className="eyebrow">AI Taste Memory App</p>
            <h1>맛나리오</h1>
          </button>
          <button className="icon-button" aria-label="마이페이지" onClick={() => setView("profile")}>
            {profile.photo ? <img src={profile.photo} alt="프로필" /> : <span>♡</span>}
          </button>
        </header>

        {view === "loading" && (
          <section className="loading-screen" aria-live="polite">
            <div className="loading-orbit">
              <span className="sparkle sparkle-a">✦</span>
              <span className="sparkle sparkle-b">✧</span>
              <span className="sparkle sparkle-c">✦</span>
              <Image src="/assets/mascot-recipe.png" width={250} height={250} alt="둥둥 떠 있는 레시피 마스코트" priority className="floating-recipe" />
            </div>
            <div className="loading-copy">
              <p className="pill-label">1인분 계량 복원 중</p>
              <h2>{loadingMessages[activeStep]}</h2>
              <p>CSV 레시피 DB와 공공데이터를 참고해서 g, ml, 큰술 단위까지 맞추고 있어요.</p>
            </div>
            <div className="progress-dots">
              {loadingMessages.map((message, index) => (
                <span key={message} className={index === activeStep ? "active" : ""} />
              ))}
            </div>
          </section>
        )}

        {view === "home" && (
          <>
            <section className="hero-card">
              <div className="hero-text">
                <span className="badge">기억 속 맛 복원소</span>
                <h2>그때 먹었던 맛, 1인분으로 다시 만들어요.</h2>
                <p>장소, 시기, 재료, 분위기를 알려주면 마스코트 셰프가 레시피 DB를 뒤져 정확한 계량의 맛 시나리오를 만들어줘요.</p>
              </div>
              <div className="hero-mascot-wrap">
                <Image src="/assets/mascot-chef.png" width={260} height={260} alt="맛나리오 셰프 마스코트" priority className="hero-mascot" />
              </div>
            </section>

            <section className="chat-card">
              <div className="chat-avatar">
                <Image src="/assets/mascot-chef.png" width={76} height={76} alt="마스코트" />
              </div>
              <div className="chat-bubbles">
                <div className="bubble mascot">안녕하세요! 찾고 싶은 추억의 맛이 있나요?</div>
                <div className="bubble mascot">맛의 단서를 알려주시면 1인분 기준으로 g/ml까지 맞춰볼게요.</div>
              </div>
            </section>

            <section className="examples-section">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Quick Start</p>
                  <h3>바로 써볼 수 있는 맛 단서</h3>
                </div>
              </div>
              <div className="example-grid">
                {examples.map((example) => (
                  <button type="button" key={example.memoryTitle} onClick={() => applyExample(example)} className="example-chip">
                    {example.memoryTitle}
                  </button>
                ))}
              </div>
            </section>

            <form className="restore-form" onSubmit={submit}>
              <label className="field-card">
                <span>찾고 싶은 맛 이름</span>
                <input value={form.memoryTitle} onChange={(e) => updateField("memoryTitle", e.target.value)} placeholder="예: 학교 앞 카레 떡볶이" />
              </label>

              <div className="field-row">
                <label className="field-card small">
                  <span>장소</span>
                  <input value={form.place} onChange={(e) => updateField("place", e.target.value)} placeholder="예: 초등학교 앞" />
                </label>
                <label className="field-card small">
                  <span>시기</span>
                  <input value={form.time} onChange={(e) => updateField("time", e.target.value)} placeholder="예: 2000년대" />
                </label>
              </div>

              <label className="field-card textarea-card">
                <span>맛 단서</span>
                <textarea
                  value={form.clues}
                  onChange={(e) => updateField("clues", e.target.value)}
                  placeholder="재료, 식감, 향, 소스, 함께 먹었던 상황을 자유롭게 적어주세요. 예: 소스가 걸쭉했고 카레 향이 났어요."
                  rows={6}
                />
              </label>

              <div className="mood-card">
                <span>기억 속 맛 분위기</span>
                <div className="mood-list">
                  {moodOptions.map((mood) => (
                    <button type="button" key={mood} onClick={() => toggleMood(mood)} className={form.mood.includes(mood) ? "mood active" : "mood"}>
                      {mood}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="error-message">{error}</p>}

              <button type="submit" className="primary-cta" disabled={!canSubmit}>
                맛 기억 시작하기
              </button>
            </form>

            <section className="food-cards">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Popular Memory</p>
                  <h3>많이 찾는 추억 음식</h3>
                </div>
              </div>
              <div className="food-scroll">
                {[
                  ["학교 앞 떡볶이", "/assets/food-tteokbokki.png", "달달매콤"],
                  ["할머니 국수", "/assets/food-noodle.png", "담백고소"],
                  ["첫 데이트 스테이크", "/assets/food-steak.png", "버터향"]
                ].map(([title, asset, tag]) => (
                  <article className="food-card" key={title}>
                    <Image src={asset} width={132} height={132} alt={title} />
                    <strong>{title}</strong>
                    <span>{tag}</span>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {view === "result" && result && (
          <section className="result-screen">
            <div className="result-hero">
              <button type="button" className="back-button" onClick={() => setView("home")}>
                ← 다시 입력
              </button>
              <Image src={pickFoodAsset(result.title)} width={210} height={210} alt="복원된 음식 이미지" className="result-food" priority />
              <span className="badge">1인분 복원 완료</span>
              <h2>{result.title}</h2>
              <p>{result.subtitle}</p>
              <div className="confidence-card">
                <div>
                  <span>맛 근접도</span>
                  <strong>{result.confidence}%</strong>
                </div>
                <div className="confidence-bar">
                  <span style={{ width: `${result.confidence}%` }} />
                </div>
              </div>
            </div>

            <div className="tag-list">
              {result.tasteTags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>

            <article className="result-card story-card">
              <div className="mini-mascot">
                <Image src="/assets/mascot-recipe.png" width={70} height={70} alt="레시피 마스코트" />
              </div>
              <p>{result.story}</p>
            </article>

            <article className="result-card">
              <div className="card-heading">
                <h3>재료</h3>
                <span>1인분 기준</span>
              </div>
              <ul className="ingredient-list precise">
                {result.ingredients.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="result-card">
              <h3>조리 순서</h3>
              <ol className="step-list">
                {result.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>

            <article className="result-card">
              <h3>맛 조정 팁</h3>
              <ul className="tip-list">
                {result.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </article>

            <section className="similar-section">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Recipe DB Match</p>
                  <h3>참고한 유사 레시피</h3>
                </div>
              </div>
              <div className="similar-list">
                {result.similarRecipes.slice(0, 5).map((recipe) => (
                  <article className="similar-card" key={recipe.id}>
                    <div>
                      <strong>{recipe.title}</strong>
                      <p>{recipe.summary}</p>
                      <div className="mini-tags">
                        {recipe.meta.slice(0, 4).map((meta) => (
                          <span key={meta}>{meta}</span>
                        ))}
                      </div>
                    </div>
                    <span className={recipe.source === "foodsafe" ? "source public" : "source"}>{recipe.source === "foodsafe" ? "공공API" : "CSV"}</span>
                  </article>
                ))}
              </div>
            </section>

            <p className="source-note">{result.sourceNote}</p>

            <div className="feedback-bar">
              <button type="button" className={currentFeedback === "match" ? "selected" : ""} onClick={() => leaveFeedback("match")}>
                이맛 맞아!
              </button>
              <button type="button" className={currentFeedback === "different" ? "selected" : ""} onClick={() => leaveFeedback("different")}>
                조금 달라요
              </button>
            </div>
            {feedbackMessage && <p className="success-message">{feedbackMessage}</p>}

            <button type="button" className="secondary-cta" onClick={shareResultToCommunity}>
              커뮤니티에 이 레시피 공유하기
            </button>
          </section>
        )}

        {view === "community" && (
          <section className="page-section">
            <div className="page-hero community-hero">
              <span className="badge">커뮤니티</span>
              <h2>같은 맛을 그리워하는 사람들과 만나요.</h2>
              <p>같은 식당, 같은 학교 앞, 같은 여행지에서 먹었던 음식을 글·사진·레시피로 함께 복원해요.</p>
            </div>

            <form className="community-compose" onSubmit={submitCommunityPost}>
              <div className="compose-header">
                <Avatar profile={profile} />
                <div>
                  <strong>{profile.nickname}</strong>
                  <span>새 맛 기억 공유하기</span>
                </div>
              </div>
              <input value={communityDraft.title} onChange={(e) => setCommunityDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="글 제목: 예) 성수동 옛날 돈가스집 찾는 분?" />
              <textarea value={communityDraft.body} onChange={(e) => setCommunityDraft((prev) => ({ ...prev, body: e.target.value }))} placeholder="기억나는 맛, 식당 위치, 같이 먹었던 음식, 직접 복원한 레시피를 적어주세요." rows={4} />
              {communityDraft.image && <img src={communityDraft.image} alt="첨부 사진 미리보기" className="post-preview" />}
              <div className="compose-actions">
                <label className="photo-upload">
                  사진 추가
                  <input type="file" accept="image/*" onChange={handleCommunityPhoto} />
                </label>
                <button type="submit" disabled={!communityDraft.title.trim() || !communityDraft.body.trim()}>
                  공유하기
                </button>
              </div>
            </form>

            <div className="post-list">
              {communityPosts.map((post) => (
                <article className="post-card" key={post.id}>
                  <div className="post-author">
                    {post.avatar ? <img src={post.avatar} alt="작성자 프로필" /> : <Image src="/assets/mascot-recipe.png" width={46} height={46} alt="기본 프로필" />}
                    <div>
                      <strong>{post.author}</strong>
                      <span>{formatDate(post.createdAt)}</span>
                    </div>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.body}</p>
                  {post.image && <img src={post.image} alt="공유 사진" className="post-image" />}
                  {post.recipeTitle && <div className="linked-recipe">🍓 공유 레시피 · {post.recipeTitle}</div>}
                  <div className="mini-tags">
                    {post.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="post-actions">
                    <button type="button" onClick={() => likePost(post.id)}>♡ {post.likes}</button>
                    <button type="button">댓글 {post.comments}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "history" && (
          <section className="page-section">
            <div className="page-hero history-hero">
              <span className="badge">기록</span>
              <h2>내가 부탁했던 음식 리스트</h2>
              <p>복원했던 레시피와 피드백을 저장해두고 다시 열어볼 수 있어요.</p>
            </div>

            {history.length === 0 ? (
              <EmptyState title="아직 기록이 없어요" body="홈에서 맛 기억을 하나 복원하면 여기에 자동 저장돼요." action="홈으로 가기" onAction={() => setView("home")} />
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <article className="history-card" key={item.id}>
                    <button type="button" className="history-main" onClick={() => openHistoryItem(item)}>
                      <Image src={pickFoodAsset(item.result.title)} width={80} height={80} alt="음식 아이콘" />
                      <div>
                        <span>{formatDate(item.createdAt)}</span>
                        <strong>{item.result.title}</strong>
                        <p>{item.form.place || item.form.time || "장소·시기 미입력"}</p>
                        <small>{item.feedback === "match" ? "이맛 맞아!" : item.feedback === "different" ? "조금 달라요" : "피드백 없음"}</small>
                      </div>
                    </button>
                    <button type="button" className="delete-button" onClick={() => removeHistoryItem(item.id)} aria-label="기록 삭제">
                      ×
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "profile" && (
          <section className="page-section">
            <div className="page-hero profile-hero">
              <span className="badge">마이</span>
              <h2>내 맛나리오 프로필</h2>
              <p>커뮤니티에서 사용할 닉네임과 사진을 등록해보세요.</p>
            </div>

            <section className="profile-card">
              <div className="profile-photo-wrap">
                {profile.photo ? <img src={profile.photo} alt="프로필" /> : <Image src="/assets/mascot-chef.png" width={160} height={160} alt="기본 마스코트" />}
                <label className="photo-upload floating-upload">
                  사진 변경
                  <input type="file" accept="image/*" onChange={handleProfilePhoto} />
                </label>
              </div>

              <label className="field-card">
                <span>닉네임</span>
                <input value={profile.nickname} onChange={(e) => saveProfile({ ...profile, nickname: e.target.value })} placeholder="닉네임을 입력하세요" />
              </label>

              <label className="field-card textarea-card compact">
                <span>소개</span>
                <textarea value={profile.bio} onChange={(e) => saveProfile({ ...profile, bio: e.target.value })} rows={3} placeholder="어떤 맛을 찾고 있나요?" />
              </label>

              <div className="profile-stats">
                <div>
                  <strong>{history.length}</strong>
                  <span>복원 기록</span>
                </div>
                <div>
                  <strong>{communityPosts.filter((post) => post.author === profile.nickname).length}</strong>
                  <span>공유 글</span>
                </div>
                <div>
                  <strong>{history.filter((item) => item.feedback === "match").length}</strong>
                  <span>성공한 맛</span>
                </div>
              </div>
            </section>
          </section>
        )}

        <nav className="bottom-nav" aria-label="하단 메뉴">
          <button type="button" className={view === "home" || view === "result" || view === "loading" ? "active" : ""} onClick={() => setView("home")}>홈</button>
          <button type="button" className={view === "community" ? "active" : ""} onClick={() => setView("community")}>커뮤니티</button>
          <button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}>기록</button>
          <button type="button" className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}>마이</button>
        </nav>
      </div>
    </main>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  return profile.photo ? <img src={profile.photo} alt="프로필" className="avatar-img" /> : <Image src="/assets/mascot-chef.png" width={48} height={48} alt="프로필 마스코트" className="avatar-img" />;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <section className="empty-state">
      <Image src="/assets/mascot-recipe.png" width={110} height={110} alt="빈 상태 마스코트" />
      <h3>{title}</h3>
      <p>{body}</p>
      <button type="button" onClick={onAction}>{action}</button>
    </section>
  );
}
