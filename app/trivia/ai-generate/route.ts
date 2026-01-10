// app/trivia/ai-generate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/* ============================================================
   ANSWER-LENGTH FAIRNESS GUARDRAILS (Fix "longest = correct")
============================================================ */

const OPTION_MIN_CHARS = 1;
const OPTION_MAX_CHARS = 48; // keep answers short + punchy
const OPTION_MAX_WORDS = 8;  // prevents essay options
const OPTION_LEN_MAX_MINUS_MIN = 16; // max-min length spread allowed
const OPTION_LEN_RATIO_MAX = 1.35;   // max/min ratio allowed
const CORRECT_LONGEST_DELTA_MAX = 4; // correct can't exceed 2nd-longest by > 4 chars

const BANNED_OPTION_PHRASES = [
  "all of the above",
  "none of the above",
  "both a and b",
  "both b and c",
  "a and b",
  "b and c",
  "a and c",
  "all are correct",
  "all are true",
];

function wordCount(s: string) {
  return (s.trim().match(/\S+/g) || []).length;
}

/** normalize: trim, collapse whitespace, remove leading bullets/labels like "A) " */
function normalizeOptionText(raw: any): string {
  let s = String(raw ?? "").trim();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/^[A-Da-d][\)\.\:\-]\s*/g, ""); // "A) " / "B. " / "C: "
  s = s.trim();
  return s;
}

function normalizeQuestionText(raw: any): string {
  let s = String(raw ?? "").trim();
  s = s.replace(/\s+/g, " ");
  return s;
}

/** Safety: AI never controls correctness bounds */
function normalizeCorrectIndex(index: any): number {
  if (typeof index !== "number") return Math.floor(Math.random() * 4);
  if (index < 0 || index > 3) return Math.floor(Math.random() * 4);
  return index;
}

/** Remove ```json fences and extract first JSON object block if needed. */
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

/** Shuffle options but keep correct answer mapped */
function shuffleQuestionOptions(q: {
  question: string;
  options: string[];
  correct_index: number;
}) {
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return { ...q, correct_index: normalizeCorrectIndex(q.correct_index) };
  }

  const originalOptions = q.options;
  const originalCorrectIndex = normalizeCorrectIndex(q.correct_index);

  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const newOptions = indices.map((idx) => originalOptions[idx]);
  const newCorrectIndex = indices.indexOf(originalCorrectIndex);

  return { ...q, options: newOptions, correct_index: newCorrectIndex };
}

function getOptionLengths(opts: string[]) {
  const lens = opts.map((o) => o.length);
  const min = Math.min(...lens);
  const max = Math.max(...lens);

  // 2nd largest
  const sorted = [...lens].sort((a, b) => b - a);
  const secondMax = sorted[1] ?? max;

  return { lens, min, max, secondMax };
}

function hasBannedPhrase(opt: string) {
  const v = opt.toLowerCase();
  return BANNED_OPTION_PHRASES.some((p) => v.includes(p));
}

/**
 * Returns null if valid; else returns string reason.
 * Enforces: 4 options, short, similar-length, and correct not "obviously longest".
 */
function validateFairOptions(options: string[], correctIndex: number): string | null {
  if (!Array.isArray(options) || options.length !== 4) return "Options must be exactly 4.";

  const cleaned = options.map(normalizeOptionText);

  for (const opt of cleaned) {
    if (opt.length < OPTION_MIN_CHARS) return "An option is empty.";
    if (opt.length > OPTION_MAX_CHARS) return `An option exceeds ${OPTION_MAX_CHARS} chars.`;
    if (wordCount(opt) > OPTION_MAX_WORDS) return `An option exceeds ${OPTION_MAX_WORDS} words.`;
    if (hasBannedPhrase(opt)) return `Contains banned phrase option: "${opt}".`;
  }

  // no duplicates (case-insensitive)
  const lowered = cleaned.map((o) => o.toLowerCase());
  const set = new Set(lowered);
  if (set.size !== 4) return "Duplicate options detected.";

  const { min, max, secondMax } = getOptionLengths(cleaned);

  // Similar length constraints
  if (max - min > OPTION_LEN_MAX_MINUS_MIN) return "Options vary too much in length.";
  const ratio = min > 0 ? max / min : 999;
  if (ratio > OPTION_LEN_RATIO_MAX) return "Options length ratio too high.";

  // Correct answer can't be *clearly* longest
  const cLen = cleaned[correctIndex]?.length ?? 0;
  if (cLen === max && cLen - secondMax > CORRECT_LONGEST_DELTA_MAX) {
    return "Correct option is notably longer than others.";
  }

  return null;
}

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

/**
 * Optional: PhD “strictness” gate. (Keep yours; unchanged.)
 */
async function isTruePhDQuestion(question: string): Promise<boolean> {
  const graderPrompt = `
You are a doctoral qualifying-exam committee member.

Evaluate the following question:

"${question}"

Rules:
- If this question could be answered by a well-read undergraduate or casual expert, return NO.
- If this question would challenge or divide actual researchers in the field, return YES.
- Be extremely strict.

Respond with ONLY:
YES or NO
`;

  const result = await openai.responses.create({
    model: "gpt-4.1",
    input: graderPrompt,
  });

  const verdict = result.output_text?.trim();
  return verdict === "YES";
}

/* ============================================================
   Targeted Regeneration: regenerate ONLY broken questions
============================================================ */

const REGEN_ATTEMPTS_PER_QUESTION = 3;

async function regenerateSingleQuestion(params: {
  difficultySpec: string;
  topic: string;
}): Promise<{ question: string; options: string[]; correct_index: number }> {
  const prompt = `
Generate ONE multiple-choice trivia question.

TOPIC: ${params.topic}

DIFFICULTY CONTRACT:
${params.difficultySpec}

HARD FORMAT RULES:
- EXACTLY 4 options.
- Each option must be SHORT: 4–8 words max, <= ${OPTION_MAX_CHARS} chars.
- Options must be similar length (do NOT make one option much longer).
- Never use "All of the above" or "None of the above".
- Correct answer must NOT be the longest option.
- No explanations. No markdown. Return ONLY JSON.

Return JSON exactly:
{
  "question": "string",
  "options": ["A","B","C","D"],
  "correct_index": 0
}
`;

  const res = await openai.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  const raw = res.output_text || "";
  const cleaned = extractJson(raw);
  const parsed = JSON.parse(cleaned);

  return {
    question: normalizeQuestionText(parsed.question),
    options: (parsed.options || []).map(normalizeOptionText),
    correct_index: normalizeCorrectIndex(parsed.correct_index),
  };
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
      triviaId, // optional regen
    } = body ?? {};

    const difficultyKey = normalizeDifficultyKey(difficulty);
    if (!difficultyKey) {
      return NextResponse.json(
        { success: false, error: `Unknown difficulty value: "${difficulty}"` },
        { status: 400 }
      );
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
    }

    const finalTopicList: string[] = (sameTopicForAllRounds
      ? Array(nRounds).fill(topicPrompt)
      : roundTopics
    ).map((t: any) => String(t || "").trim());

    const difficultySpec = getDifficultySpec(difficultyKey);

    // 🔥 IMPORTANT: we explicitly constrain option length parity here
    const generationPrompt = `
You generate structured trivia games.

Create ${nRounds} rounds with ${nQuestions} questions per round.

DIFFICULTY CONTRACT — VIOLATION INVALIDATES OUTPUT:
${difficultySpec}

Topics per round: ${JSON.stringify(finalTopicList)}

HARD RULES (DO NOT VIOLATE):
- Each question must have EXACTLY 4 options.
- Each option must be SHORT: 4–8 words max and <= ${OPTION_MAX_CHARS} characters.
- Options must be similar length. Never make the correct answer notably longer than others.
- Do NOT use "All of the above" or "None of the above".
- correct_index must be 0–3.
- Return ONLY JSON (no markdown fences, no commentary).

Return JSON:
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

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: generationPrompt,
    });

    rawText = response.output_text;
    if (!rawText) throw new Error("AI returned no output");

    const cleaned = extractJson(rawText);

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(
        `AI output was not valid JSON after cleaning. First 200 chars: ${cleaned.slice(0, 200)}`
      );
    }

    if (!parsed?.rounds || !Array.isArray(parsed.rounds)) {
      throw new Error("AI output missing rounds[] array");
    }
    if (parsed.rounds.length !== nRounds) {
      throw new Error(`AI returned ${parsed.rounds.length} rounds; expected ${nRounds}`);
    }

    // Optional PhD gatekeeper (unchanged)
    if (difficultyKey === "phd") {
      for (const round of parsed.rounds) {
        for (const q of round.questions || []) {
          const ok = await isTruePhDQuestion(String(q.question || ""));
          if (!ok) throw new Error("Generated question rejected: not true PhD difficulty");
        }
      }
    }

    // ✅ Post-validate + targeted regen for any "longest answer giveaway"
    for (let r = 0; r < parsed.rounds.length; r++) {
      const round = parsed.rounds[r];
      const topic = String(round?.topic || finalTopicList[r] || topicPrompt || "General").trim();

      if (!Array.isArray(round.questions) || round.questions.length !== nQuestions) {
        throw new Error(
          `Round ${Number(round?.round_number || r + 1)} returned ${round?.questions?.length ?? 0
          } questions; expected ${nQuestions}`
        );
      }

      for (let qi = 0; qi < round.questions.length; qi++) {
        let q = round.questions[qi];

        // normalize first
        const normalized = {
          question: normalizeQuestionText(q.question),
          options: (q.options || []).map(normalizeOptionText),
          correct_index: normalizeCorrectIndex(q.correct_index),
        };

        let reason = validateFairOptions(normalized.options, normalized.correct_index);

        if (!reason) {
          // keep normalized
          round.questions[qi] = normalized;
          continue;
        }

        // Targeted regen attempts
        let fixed = false;
        for (let attempt = 1; attempt <= REGEN_ATTEMPTS_PER_QUESTION; attempt++) {
          try {
            const regenerated = await regenerateSingleQuestion({ difficultySpec, topic });
            const rReason = validateFairOptions(regenerated.options, regenerated.correct_index);
            if (!rReason) {
              round.questions[qi] = regenerated;
              fixed = true;
              break;
            }
            reason = rReason || reason;
          } catch (e) {
            // keep trying
          }
        }

        if (!fixed) {
          throw new Error(
            `Failed to generate fair options for round ${r + 1}, question ${qi + 1}. Last reason: ${reason}`
          );
        }
      }
    }

    // Supabase service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

      const { error: delErr } = await supabase
        .from("trivia_questions")
        .delete()
        .eq("trivia_card_id", triviaCardId);

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

    // Insert questions (shuffled)
    const rows: any[] = [];

    for (const round of parsed.rounds) {
      const roundNum = Number(round?.round_number) || 1;
      const topic = String(round?.topic || topicPrompt || "General");

      for (const rawQ of round.questions || []) {
        // shuffle AFTER validation so we don't change the fairness check target
        const shuffledQ = shuffleQuestionOptions({
          question: normalizeQuestionText(rawQ.question),
          options: (rawQ.options || []).map(normalizeOptionText),
          correct_index: normalizeCorrectIndex(rawQ.correct_index),
        });

        // validate again after shuffle (correct index changed)
        const safeCorrectIndex = normalizeCorrectIndex(shuffledQ.correct_index);
        const postReason = validateFairOptions(shuffledQ.options, safeCorrectIndex);
        if (postReason) {
          throw new Error(`Post-shuffle validation failed: ${postReason}`);
        }

        rows.push({
          trivia_card_id: triviaCardId,
          round_number: roundNum,
          question_text: String(shuffledQ.question || "").trim(),
          options: shuffledQ.options.map((x: any) => String(x)),
          correct_index: safeCorrectIndex,
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

    return NextResponse.json(
      { success: false, error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
