import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import iconv from "iconv-lite";

const inputDir = process.argv[2] || "./data/imports";
const outputPath = process.argv[3] || "./data/recipes.seed.json";
const MAX_ITEMS = Number(process.env.SEED_LIMIT || 6500);

const columns = [
  "RCP_SNO",
  "RCP_TTL",
  "CKG_NM",
  "INQ_CNT",
  "RCMM_CNT",
  "SRAP_CNT",
  "CKG_MTH_ACTO_NM",
  "CKG_STA_ACTO_NM",
  "CKG_MTRL_ACTO_NM",
  "CKG_KND_ACTO_NM",
  "CKG_IPDC",
  "CKG_MTRL_CN",
  "CKG_INBUN_NM",
  "CKG_DODF_NM",
  "CKG_TIME_NM"
];

const nostalgiaKeywords = [
  "떡볶이", "국수", "잔치국수", "라면", "컵라면", "김치찌개", "된장찌개", "부대찌개", "카레",
  "돈까스", "김밥", "볶음밥", "미역국", "칼국수", "만두", "토스트", "스테이크", "어묵", "오뎅",
  "분식", "학교", "급식", "도시락", "간식", "야식", "명절", "할머니", "엄마"
];

function clean(value = "") {
  return String(value)
    .replace(/\u0007/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quote && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quote = !quote;
    } else if (char === "," && !quote) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function toNumber(value) {
  const number = Number(String(value || "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function toSeed(row) {
  const title = clean(row.RCP_TTL || row.CKG_NM).slice(0, 100);
  const name = clean(row.CKG_NM || title).slice(0, 80);
  const intro = clean(row.CKG_IPDC).slice(0, 280);
  const ingredients = clean(row.CKG_MTRL_CN).replaceAll("|", " · ").slice(0, 650);
  const words = [title, name, intro, ingredients, row.CKG_MTH_ACTO_NM, row.CKG_STA_ACTO_NM, row.CKG_MTRL_ACTO_NM, row.CKG_KND_ACTO_NM].join(" ");
  const keywords = Array.from(new Set(words.split(/[^가-힣A-Za-z0-9]+/).filter((word) => word.length >= 2))).slice(0, 80);
  return {
    id: clean(row.RCP_SNO),
    title,
    name,
    intro,
    ingredients,
    serving: clean(row.CKG_INBUN_NM).slice(0, 20),
    difficulty: clean(row.CKG_DODF_NM).slice(0, 20),
    time: clean(row.CKG_TIME_NM).slice(0, 20),
    method: clean(row.CKG_MTH_ACTO_NM).slice(0, 30),
    situation: clean(row.CKG_STA_ACTO_NM).slice(0, 30),
    materialType: clean(row.CKG_MTRL_ACTO_NM).slice(0, 30),
    kind: clean(row.CKG_KND_ACTO_NM).slice(0, 30),
    views: toNumber(row.INQ_CNT),
    recommendations: toNumber(row.RCMM_CNT),
    scraps: toNumber(row.SRAP_CNT),
    keywords
  };
}

async function readFile(filePath, map) {
  const stream = fs.createReadStream(filePath).pipe(iconv.decodeStream(process.env.CSV_ENCODING || "cp949"));
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = [];
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (lineNumber === 1) {
      headers = parseCsvLine(line).map(clean);
      continue;
    }
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      if (columns.includes(header)) row[header] = values[index] ?? "";
    });
    if (!row.RCP_SNO) continue;
    const seed = toSeed(row);
    const query = `${seed.title} ${seed.name} ${seed.intro} ${seed.ingredients}`;
    const nostalgia = nostalgiaKeywords.some((keyword) => query.includes(keyword));
    const score = seed.views + seed.recommendations * 30 + seed.scraps * 10 + (nostalgia ? 1000000 : 0);
    const prev = map.get(seed.id);
    if (!prev || score > prev._score) map.set(seed.id, { ...seed, _score: score });
  }
}

const files = fs.existsSync(inputDir)
  ? fs.readdirSync(inputDir).filter((file) => file.endsWith(".csv")).map((file) => path.join(inputDir, file))
  : [];

if (files.length === 0) {
  console.error(`CSV 파일을 찾지 못했어요: ${inputDir}`);
  process.exit(1);
}

const map = new Map();
for (const file of files) {
  console.log(`reading ${file}`);
  await readFile(file, map);
}

const items = Array.from(map.values())
  .sort((a, b) => b._score - a._score)
  .slice(0, MAX_ITEMS)
  .map(({ _score, ...item }) => item);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(items, null, 0), "utf8");
console.log(`created ${outputPath} (${items.length} recipes)`);
