// app/trivia/ai-generate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function normalizeDifficultyKey(
  raw: any
): "" | "elementary" | "jr_high" | "high_school" | "college" | "phd" {
  const v = String(raw || "").trim().toLowerCase();

  if (v === "elementary") return "elementary";
  if (v === "jr_high" || v === "junior high" || v === "junior_high" || v === "jr high") return "jr_high";
  if (v === "high_school" || v === "high school" || v === "highschool") return "high_school";
  if (v === "college") return "college";
  if (v === "phd" || v === "ph.d" || v === "ph.d." || v === "ph d") return "phd";

  return "";
}

function getDifficultySpec(difficulty: string): string {
  switch (difficulty) {
    case "elementary":
      return `
ABSOLUTE LEVEL: Ages 7–9
- One-step identification
- No reasoning
- Answerable instantly
`;
    case "jr_high":
      return `
ABSOLUTE LEVEL: Ages 11–13
- One reasoning step
- Basic cause and effect
`;
    case "high_school":
      return `
ABSOLUTE LEVEL: Ages 14–17
- Conceptual understanding
- Application of knowledge
`;
    case "college":
      return `
ABSOLUTE LEVEL: Undergraduate upper division
- Multi-step reasoning
- Scenario-based logic
`;
    case "phd":
      return `
ABSOLUTE LEVEL: Doctoral / Research Expert

MANDATORY CHARACTERISTICS:
- Question must involve:
  • unresolved research debates OR
  • methodological limitations OR
  • edge-case exceptions OR
  • competing theoretical frameworks
- Question must NOT be answerable by:
  • definitions
  • memorized facts
  • popular knowledge
- Assume respondent is an active researcher
- Distractors must be nearly correct but subtly wrong
- Only specialists in the field should succeed
`;
    default:
      return "";
  }
}

function normalizeCorrectIndex(index: any): number {
  if (typeof index !== "number") return Math.floor(Math.random() * 4);
  if (index < 0 || index > 3) return Math.floor(Math.random() * 4);
  return index;
}

function extractJson(raw: string): string {
  const text = (raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

function norm(s: any): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function lowerNorm(s: any): string {
  return norm(s).toLowerCase();
}

function shuffleQuestionOptions(q: { question: string; options: string[]; correct_index: number }) {
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return { ...q, correct_index: normalizeCorrectIndex(q.correct_index) };
  }

  const originalOptions = q.options.map((x) => String(x));
  const originalCorrectIndex = normalizeCorrectIndex(q.correct_index);

  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const newOptions = indices.map((idx) => originalOptions[idx]);
  const newCorrectIndex = indices.indexOf(originalCorrectIndex);

  return { ...q, question: String(q.question || ""), options: newOptions, correct_index: newCorrectIndex };
}

function getLengthCaps(difficultyKey: ReturnType<typeof normalizeDifficultyKey>) {
  switch (difficultyKey) {
    case "elementary":
      return { stemMax: 110, optMax: 32, optMin: 2 };
    case "jr_high":
      return { stemMax: 140, optMax: 44, optMin: 3 };
    case "high_school":
      return { stemMax: 170, optMax: 56, optMin: 3 };
    case "college":
      return { stemMax: 210, optMax: 70, optMin: 3 };
    case "phd":
      return { stemMax: 260, optMax: 90, optMin: 3 };
    default:
      return { stemMax: 170, optMax: 56, optMin: 3 };
  }
}

function classifyOptionType(opt: string): "number" | "date" | "person" | "phrase" {
  const s = norm(opt);

  if (/\b(18|19|20)\d{2}\b/.test(s) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(s)) {
    return "date";
  }

  if (/^[\d,\.\-\+]+$/.test(s)) return "number";
  if (/\b\d+(\.\d+)?\b/.test(s) && s.length <= 10) return "number";

  if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(s) && s.split(" ").length <= 4) return "person";

  return "phrase";
}

function hasAnyPunct(s: string) {
  return /[;:()"“”'’—–]/.test(s);
}
function endsWithPeriod(s: string) {
  return /\.\s*$/.test(s);
}
function countWords(s: string) {
  const t = norm(s);
  if (!t) return 0;
  return t.split(" ").filter(Boolean).length;
}
function optionLen(s: string) {
  return norm(s).length;
}

function validateQuestionFairness(params: {
  stem: string;
  options: string[];
  correctIndex: number;
  difficultyKey: ReturnType<typeof normalizeDifficultyKey>;
}) {
  const { stem, options, correctIndex, difficultyKey } = params;

  const reasons: string[] = [];
  const caps = getLengthCaps(difficultyKey);

  const cleanStem = norm(stem);
  const cleanOpts = options.map((o) => norm(o));
  const ci = normalizeCorrectIndex(correctIndex);

  if (!cleanStem) reasons.push("Empty question stem");
  if (!Array.isArray(cleanOpts) || cleanOpts.length !== 4) reasons.push("Options must be exactly 4");
  if (cleanOpts.some((o) => !o)) reasons.push("One or more empty options");

  if (cleanStem.length > caps.stemMax) reasons.push(`Stem too long (${cleanStem.length} > ${caps.stemMax})`);
  cleanOpts.forEach((o, i) => {
    if (o.length > caps.optMax) reasons.push(`Option ${i} too long (${o.length} > ${caps.optMax})`);
    if (o.length < caps.optMin) reasons.push(`Option ${i} too short (${o.length} < ${caps.optMin})`);
  });

  const types = cleanOpts.map(classifyOptionType);
  const uniqueTypes = new Set(types);
  if (uniqueTypes.size > 1) reasons.push(`Mixed option types (${Array.from(uniqueTypes).join(", ")})`);

  const periodFlags = cleanOpts.map(endsWithPeriod);
  if (new Set(periodFlags).size > 1) reasons.push("Mixed punctuation: some options end with '.' and others do not");

  const punctFlags = cleanOpts.map(hasAnyPunct);
  if (punctFlags.filter(Boolean).length === 1) reasons.push("Only one option has notable punctuation (giveaway)");

  const lengths = cleanOpts.map(optionLen);
  const sorted = [...lengths].sort((a, b) => b - a);
  const longest = sorted[0];
  const second = sorted[1];
  const correctLen = lengths[ci];

  const correctIsLongest = correctLen === longest;
  const uniqueLongest = longest > second;

  if (correctIsLongest && uniqueLongest) {
    const diff = longest - second;
    if (diff >= 10 || longest >= Math.floor(second * 1.25)) {
      reasons.push("Correct option is uniquely longest (classic giveaway)");
    }
  }

  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);
  if (maxLen >= Math.floor(minLen * 2) && maxLen - minLen >= 18) reasons.push("Options vary too much in length (pattern giveaway)");

  const wcounts = cleanOpts.map(countWords);
  const wMax = Math.max(...wcounts);
  const wMin = Math.min(...wcounts);
  if (wMax - wMin >= 6) reasons.push("Options vary too much in word count (shape giveaway)");

  const correctOpt = cleanOpts[ci] || "";
  if (/\b(always|never|guaranteed|only|all of the above|none of the above)\b/i.test(correctOpt)) {
    reasons.push("Correct option contains a giveaway absolute/format phrase");
  }

  if (/\b(NOT|EXCEPT|least likely)\b/i.test(cleanStem) && difficultyKey !== "college" && difficultyKey !== "phd") {
    reasons.push("Negation-style stem (NOT/EXCEPT) increases ambiguity for this difficulty");
  }

  return { ok: reasons.length === 0, reasons, cleaned: { stem: cleanStem, options: cleanOpts, correctIndex: ci } };
}

async function ambiguityCheck(params: { stem: string; options: string[]; correctIndex: number }) {
  const { stem, options, correctIndex } = params;

  const prompt = `
You are a strict trivia judge. Determine if the question is unambiguous.

Question:
${stem}

Options:
A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}

The intended correct answer index is: ${correctIndex} (0=A,1=B,2=C,3=D)

Return ONLY JSON:
{
  "unambiguous": true|false,
  "confidence": 0-100,
  "notes": "short"
}
`;

  const res = await openai.responses.create({ model: "gpt-4.1", input: prompt });
  const txt = res.output_text?.trim() || "";
  const cleaned = extractJson(txt);

  try {
    const parsed = JSON.parse(cleaned);
    const unamb = !!parsed?.unambiguous;
    const conf = Number(parsed?.confidence ?? 0);
    if (!unamb) return { ok: false, note: String(parsed?.notes || "Ambiguous") };
    if (conf < 55) return { ok: false, note: "Low confidence on unambiguity" };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function isTruePhDQuestion(question: string): Promise<boolean> {
  const graderPrompt = `
You are a doctoral qualifying-exam committee member.

Evaluate the following question:

"${question}"

Respond with ONLY:
YES or NO
`;
  const result = await openai.responses.create({ model: "gpt-4.1", input: graderPrompt });
  return (result.output_text?.trim() || "") === "YES";
}

function getStemOpener(stem: string) {
  const s = lowerNorm(stem);
  const parts = s.split(" ").filter(Boolean);
  return parts.slice(0, 3).join(" ");
}

function jaccardSimilarity(a: string, b: string) {
  const A = new Set(lowerNorm(a).split(" ").filter(Boolean));
  const B = new Set(lowerNorm(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  A.forEach((w) => {
    if (B.has(w)) inter++;
  });

  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Generate a single question (regen)
 * NEW: supports forbiddenCorrectAnswers + forbiddenOpeners
 */
async function generateSingleQuestion(params: {
  topic: string;
  difficultyKey: ReturnType<typeof normalizeDifficultyKey>;
  difficultySpec: string;
  caps: { stemMax: number; optMax: number; optMin: number };
  avoidNotes?: string[];
  forbiddenCorrectAnswers?: string[];
  forbiddenOpeners?: string[];
  roundNumber: number;
  qNumber: number;
}) {
  const { topic, difficultySpec, caps, avoidNotes, forbiddenCorrectAnswers, forbiddenOpeners, roundNumber, qNumber } =
    params;

  const avoid = (avoidNotes || []).slice(0, 8).map((x) => `- ${x}`).join("\n");
  const forbiddenAns = (forbiddenCorrectAnswers || []).slice(0, 30).map((x) => `- ${x}`).join("\n");
  const forbiddenOps = (forbiddenOpeners || []).slice(0, 25).map((x) => `- ${x}`).join("\n");

  const prompt = `
You are generating ONE high-quality trivia question.

Topic: ${topic}
Round: ${roundNumber}
Question #: ${qNumber}

DIFFICULTY CONTRACT:
${difficultySpec}

FORMAT + FAIRNESS RULES (MANDATORY):
- Write the correct answer FIRST internally, then craft 3 plausible distractors.
- All 4 options must be the same TYPE (all people OR all dates OR all places OR all terms).
- All 4 options must be similar in length and grammar shape.
- Do NOT make the correct option the longest.
- Avoid unique punctuation in only one option.
- Avoid absolutes like "always/never/only".
- No "All of the above" or "None of the above".
- VARY the stem opening; do not reuse a template opener.

HARD LENGTH LIMITS:
- Stem length <= ${caps.stemMax} characters
- Each option length <= ${caps.optMax} characters
- Each option length >= ${caps.optMin} characters

${
  forbiddenOps
    ? `FORBIDDEN STEM OPENERS (the first 3 words of the question MUST NOT match any line below):\n${forbiddenOps}\n`
    : ""
}

${
  forbiddenAns
    ? `FORBIDDEN CORRECT ANSWERS (the intended correct option MUST NOT be any of these exact strings):\n${forbiddenAns}\n`
    : ""
}

${avoid ? `AVOID THESE FAILURES:\n${avoid}` : ""}

Return ONLY JSON (no markdown):
{
  "question": "string",
  "options": ["A","B","C","D"],
  "correct_index": 0
}
`;

  const res = await openai.responses.create({ model: "gpt-4.1", input: prompt });
  const txt = res.output_text?.trim() || "";
  const cleaned = extractJson(txt);
  return JSON.parse(cleaned) as { question: string; options: string[]; correct_index: number };
}

function balanceCorrectIndexAcrossSet(items: Array<{ options: string[]; correct_index: number; question: string }>) {
  const maxIters = 60;

  const count = () => {
    const c = [0, 0, 0, 0];
    for (const it of items) c[normalizeCorrectIndex(it.correct_index)]++;
    return c;
  };

  const total = items.length;
  if (total < 8) return items;

  const target = total / 4;
  const tooHigh = (x: number) => x > Math.ceil(target * 1.35);

  let iter = 0;
  while (iter++ < maxIters) {
    const c = count();
    const worstIdx = c.findIndex(tooHigh);
    if (worstIdx === -1) break;

    const candidates = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => normalizeCorrectIndex(it.correct_index) === worstIdx);

    if (!candidates.length) break;

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    items[pick.i] = shuffleQuestionOptions(pick.it as any) as any;
  }

  return items;
}

export async function POST(req: Request) {
  let rawText: string | undefined;

  try {
    const body = await req.json();

    const {
      publicName,
      privateName,
      topicPrompt,
      numQuestions,
      difficulty,
      numRounds,
      sameTopicForAllRounds,
      roundTopics,
      hostId,
      triviaId,
    } = body ?? {};

    const difficultyKey = normalizeDifficultyKey(difficulty);
    if (!difficultyKey) {
      return NextResponse.json({ success: false, error: `Unknown difficulty value: "${difficulty}"` }, { status: 400 });
    }

    const nRounds = Number(numRounds);
    const nQuestions = Number(numQuestions);

    if (!Number.isInteger(nRounds) || nRounds < 1) {
      return NextResponse.json({ success: false, error: "numRounds must be an integer >= 1" }, { status: 400 });
    }
    if (!Number.isInteger(nQuestions) || nQuestions < 1) {
      return NextResponse.json({ success: false, error: "numQuestions must be an integer >= 1" }, { status: 400 });
    }

    if (!sameTopicForAllRounds) {
      if (!Array.isArray(roundTopics) || roundTopics.length !== nRounds) {
        return NextResponse.json(
          { success: false, error: "roundTopics must be an array with length === numRounds" },
          { status: 400 }
        );
      }
      if (roundTopics.some((t: any) => !norm(t))) {
        return NextResponse.json({ success: false, error: "Each round topic must be a non-empty string" }, { status: 400 });
      }
    }

    const finalTopicList = sameTopicForAllRounds
      ? Array(nRounds).fill(norm(topicPrompt))
      : (roundTopics as any[]).map((t) => norm(t));

    const difficultySpec = getDifficultySpec(difficultyKey);
    const caps = getLengthCaps(difficultyKey);

    const generationPrompt = `
You generate structured trivia games.

Create ${nRounds} rounds with ${nQuestions} questions per round.

DIFFICULTY CONTRACT — VIOLATION INVALIDATES OUTPUT:
${difficultySpec}

Topics per round: ${JSON.stringify(finalTopicList)}

FAIRNESS RULES (MANDATORY):
- Each question must have exactly 4 options.
- All 4 options must be the same TYPE (all people OR all dates OR all places OR all terms).
- Options must be similar length and grammar shape (do NOT make correct option the longest).
- Avoid unique punctuation in only one option.
- Avoid "All of the above" / "None of the above".
- Avoid "always/never/only" in correct answer.
- Vary the stem openings (do not repeat the same 3-word opener too often).

HARD LENGTH LIMITS:
- Stem length <= ${caps.stemMax} chars
- Each option length <= ${caps.optMax} chars

Return ONLY JSON:

{
  "rounds": [
    {
      "round_number": 1,
      "topic": "string",
      "questions": [
        {
          "question": "string",
          "options": ["A","B","C","D"],
          "correct_index": 2
        }
      ]
    }
  ]
}
`;

    const response = await openai.responses.create({ model: "gpt-4.1", input: generationPrompt });

    rawText = response.output_text;
    if (!rawText) throw new Error("AI returned no output");

    const cleaned = extractJson(rawText);
    const parsed = JSON.parse(cleaned);

    if (!parsed?.rounds || !Array.isArray(parsed.rounds)) throw new Error("AI output missing rounds[] array");
    if (parsed.rounds.length !== nRounds) throw new Error(`AI returned ${parsed.rounds.length} rounds; expected ${nRounds}`);

    const seenAnswers = new Set<string>();
    const seenStems: string[] = [];
    const openerCounts = new Map<string, number>();

    // NEW: threshold helper (less aggressive)
    const totalQ = nRounds * nQuestions;
    const openerThreshold = Math.max(5, Math.ceil(totalQ / 6)); // 20Q => max(5,4)=5

    const MAX_REGEN_TRIES = 3;

    for (let r = 0; r < parsed.rounds.length; r++) {
      const round = parsed.rounds[r];
      const roundNum = Number(round?.round_number) || r + 1;
      const topic = norm(round?.topic || finalTopicList[r] || topicPrompt || "General");

      const qs = Array.isArray(round?.questions) ? round.questions : [];
      if (qs.length !== nQuestions) throw new Error(`Round ${roundNum} returned ${qs.length} questions; expected ${nQuestions}`);

      for (let qi = 0; qi < qs.length; qi++) {
        let q = qs[qi];

        q = {
          question: norm(q?.question),
          options: Array.isArray(q?.options) ? q.options.map((x: any) => norm(x)) : [],
          correct_index: normalizeCorrectIndex(q?.correct_index),
        };

        for (let attempt = 0; attempt < MAX_REGEN_TRIES; attempt++) {
          const fairness = validateQuestionFairness({
            stem: q.question,
            options: q.options,
            correctIndex: q.correct_index,
            difficultyKey,
          });

          const stemOpener = getStemOpener(q.question);
          const openerCount = (openerCounts.get(stemOpener) || 0) + 1;

          // ✅ Less aggressive + use ">" not ">="
          const tooManySameOpeners = openerCount > openerThreshold;

          const tooSimilarToPrevious = seenStems.some((s) => jaccardSimilarity(s, q.question) >= 0.82);

          const correctAnswerText = q.options[q.correct_index] || "";
          const answerKey = lowerNorm(correctAnswerText);
          const duplicateAnswer = answerKey && seenAnswers.has(answerKey);

          let ambiguityFail = false;
          let ambiguityNote: string | undefined;

          const shouldAmbiguityCheck =
            difficultyKey === "college" ||
            difficultyKey === "phd" ||
            (!fairness.ok && attempt === 0) ||
            Math.random() < 0.22;

          if (fairness.ok && shouldAmbiguityCheck) {
            const amb = await ambiguityCheck({ stem: q.question, options: q.options, correctIndex: q.correct_index });
            if (!amb.ok) {
              ambiguityFail = true;
              ambiguityNote = amb.note;
            }
          }

          const failReasons = [
            ...(fairness.ok ? [] : fairness.reasons),
            ...(duplicateAnswer ? [`Duplicate correct answer in this game: "${correctAnswerText}"`] : []),
            ...(tooManySameOpeners ? [`Too many questions start the same way (template spam): "${stemOpener}"`] : []),
            ...(tooSimilarToPrevious ? ["Question stem too similar to another question"] : []),
            ...(ambiguityFail ? [`Ambiguity check failed: ${ambiguityNote || "ambiguous"}`] : []),
          ];

          if (failReasons.length === 0) {
            openerCounts.set(stemOpener, openerCount);
            if (answerKey) seenAnswers.add(answerKey);
            seenStems.push(q.question);
            qs[qi] = q;
            break;
          }

          // ✅ Final attempt: if ONLY failures are "duplicate answer" and/or "template spam", accept anyway
          if (attempt === MAX_REGEN_TRIES - 1) {
            const hardFails = failReasons.filter((x) => {
              const t = x.toLowerCase();
              if (t.startsWith("duplicate correct answer")) return false;
              if (t.startsWith("too many questions start the same way")) return false;
              return true;
            });

            if (hardFails.length === 0) {
              openerCounts.set(stemOpener, openerCount);
              if (answerKey) seenAnswers.add(answerKey);
              seenStems.push(q.question);
              qs[qi] = q;
              break;
            }

            throw new Error(
              `Failed to generate a fair question after ${MAX_REGEN_TRIES} tries (Round ${roundNum}, Q${qi + 1}). Reasons: ${failReasons.join(" | ")}`
            );
          }

          // regen with explicit forbidden lists
          const forbiddenCorrect = Array.from(seenAnswers).slice(-30);

          // forbid the worst offenders (openers already used a lot)
          const forbiddenOpeners = Array.from(openerCounts.entries())
            .filter(([, c]) => c >= Math.max(3, Math.floor(openerThreshold * 0.7)))
            .map(([op]) => op)
            .slice(0, 25);

          const regen = await generateSingleQuestion({
            topic,
            difficultyKey,
            difficultySpec,
            caps,
            avoidNotes: failReasons,
            forbiddenCorrectAnswers: forbiddenCorrect,
            forbiddenOpeners,
            roundNumber: roundNum,
            qNumber: qi + 1,
          });

          q = {
            question: norm(regen?.question),
            options: Array.isArray(regen?.options) ? regen.options.map((x: any) => norm(x)) : [],
            correct_index: normalizeCorrectIndex(regen?.correct_index),
          };
        }

        if (difficultyKey === "phd") {
          const ok = await isTruePhDQuestion(q.question);
          if (!ok) {
            const regen = await generateSingleQuestion({
              topic,
              difficultyKey,
              difficultySpec,
              caps,
              avoidNotes: ["Not true PhD difficulty (needs unresolved research / methodological edge cases)"],
              forbiddenCorrectAnswers: Array.from(seenAnswers).slice(-30),
              forbiddenOpeners: Array.from(openerCounts.keys()).slice(0, 25),
              roundNumber: roundNum,
              qNumber: qi + 1,
            });

            q = {
              question: norm(regen?.question),
              options: Array.isArray(regen?.options) ? regen.options.map((x: any) => norm(x)) : [],
              correct_index: normalizeCorrectIndex(regen?.correct_index),
            };

            const recheck = await isTruePhDQuestion(q.question);
            if (!recheck) throw new Error("Generated question rejected: not true PhD difficulty (even after regen)");

            qs[qi] = q;
          }
        }
      }

      parsed.rounds[r].questions = qs;
      parsed.rounds[r].topic = topic;
      parsed.rounds[r].round_number = roundNum;
    }

    // shuffle + balance correct index
    const allQsFlat: Array<{ question: string; options: string[]; correct_index: number; round_number: number; topic: string }> = [];

    for (const round of parsed.rounds) {
      const roundNum = Number(round?.round_number) || 1;
      const topic = String(round?.topic || topicPrompt || "General");
      for (const rawQ of round.questions || []) {
        const shuffled = shuffleQuestionOptions(rawQ);
        allQsFlat.push({
          question: norm(shuffled.question),
          options: (shuffled.options || []).map((x: any) => norm(x)),
          correct_index: normalizeCorrectIndex(shuffled.correct_index),
          round_number: roundNum,
          topic,
        });
      }
    }

    balanceCorrectIndexAcrossSet(allQsFlat);

    const byRound = new Map<number, any[]>();
    for (const q of allQsFlat) {
      if (!byRound.has(q.round_number)) byRound.set(q.round_number, []);
      byRound.get(q.round_number)!.push(q);
    }
    for (const round of parsed.rounds) {
      const roundNum = Number(round?.round_number) || 1;
      const list = byRound.get(roundNum) || [];
      round.questions = list.map((x) => ({ question: x.question, options: x.options, correct_index: x.correct_index }));
    }

    // supabase write
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let triviaCardId: string;

    if (triviaId) {
      const { data: triviaCard, error: triviaErr } = await supabase
        .from("trivia_cards")
        .update({
          public_name: publicName,
          private_name: privateName,
          topic_prompt: topicPrompt,
          difficulty,
          question_count: nQuestions,
          rounds: nRounds,
          per_round_topics: sameTopicForAllRounds ? null : roundTopics,
        })
        .eq("id", triviaId)
        .select()
        .single();

      if (triviaErr || !triviaCard) throw triviaErr || new Error("Card not found");

      triviaCardId = triviaCard.id;

      const { error: delErr } = await supabase.from("trivia_questions").delete().eq("trivia_card_id", triviaCardId);
      if (delErr) throw delErr;
    } else {
      const { data: triviaCard, error: triviaErr } = await supabase
        .from("trivia_cards")
        .insert({
          host_id: hostId,
          public_name: publicName,
          private_name: privateName,
          topic_prompt: topicPrompt,
          difficulty,
          question_count: nQuestions,
          rounds: nRounds,
          per_round_topics: sameTopicForAllRounds ? null : roundTopics,
          status: "inactive",
        })
        .select()
        .single();

      if (triviaErr || !triviaCard) throw triviaErr || new Error("Failed to create card");
      triviaCardId = triviaCard.id;
    }

    const rows: any[] = [];

    for (const round of parsed.rounds) {
      const roundNum = Number(round?.round_number) || 1;
      const topic = String(round?.topic || topicPrompt || "General");

      const qs = Array.isArray(round?.questions) ? round.questions : [];
      if (qs.length !== nQuestions) throw new Error(`Round ${roundNum} returned ${qs.length} questions; expected ${nQuestions}`);

      for (const rawQ of qs) {
        const stem = norm(rawQ?.question);
        const opts = Array.isArray(rawQ?.options) ? rawQ.options.map((x: any) => norm(x)) : [];
        const ci = normalizeCorrectIndex(rawQ?.correct_index);

        const fairness = validateQuestionFairness({ stem, options: opts, correctIndex: ci, difficultyKey });
        if (!fairness.ok) throw new Error(`Final validation failed (Round ${roundNum}): ${fairness.reasons.join(" | ")}`);

        rows.push({
          trivia_card_id: triviaCardId,
          round_number: roundNum,
          question_text: stem,
          options: opts,
          correct_index: ci,
          difficulty,
          category: topic,
        });
      }
    }

    const { error: insErr } = await supabase.from("trivia_questions").insert(rows);
    if (insErr) throw insErr;

    return NextResponse.json({ success: true, triviaId: triviaCardId });
  } catch (err: any) {
    console.error("❌ TRIVIA GENERATION FAILED:", err, {
      rawPreview: typeof rawText === "string" ? rawText.slice(0, 400) : null,
    });

    return NextResponse.json({ success: false, error: err?.message ?? "Server error" }, { status: 500 });
  }
}
