// app/trivia/ai-generate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * PHd-level = adversarial research questions ONLY
 */
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
 * Safety: AI never controls correctness bounds
 */
function normalizeCorrectIndex(index: any): number {
  if (typeof index !== "number") return Math.floor(Math.random() * 4);
  if (index < 0 || index > 3) return Math.floor(Math.random() * 4);
  return index;
}

/**
 * Remove ```json fences and extract first JSON object block if needed.
 * Fixes: SyntaxError: Unexpected token '`'
 */
function extractJson(raw: string): string {
  const text = (raw || "").trim();

  // ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  // Fallback: grab first {...} span
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

/**
 * Shuffle options but KEEP the same correct answer,
 * just move it to a random position.
 */
function shuffleQuestionOptions(q: {
  question: string;
  options: string[];
  correct_index: number;
}) {
  // If options are not exactly 4, just normalize and return as-is
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return {
      ...q,
      correct_index: normalizeCorrectIndex(q.correct_index),
    };
  }

  const originalOptions = q.options;
  const originalCorrectIndex = normalizeCorrectIndex(q.correct_index);

  // Fisher–Yates shuffle on indices [0,1,2,3]
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Build new options array with shuffled indices
  const newOptions = indices.map((idx) => originalOptions[idx]);

  // Find where the original correct option ended up
  const newCorrectIndex = indices.indexOf(originalCorrectIndex);

  return {
    ...q,
    options: newOptions,
    correct_index: newCorrectIndex,
  };
}

/**
 * SECOND PASS: Reject fake "PhD" questions
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

    // Basic payload validation (prevents weird prompts / undefined topics)
    const nRounds = Number(numRounds);
    const nQuestions = Number(numQuestions);

    if (!Number.isInteger(nRounds) || nRounds < 1) {
      return NextResponse.json(
        { success: false, error: "numRounds must be an integer >= 1" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(nQuestions) || nQuestions < 1) {
      return NextResponse.json(
        { success: false, error: "numQuestions must be an integer >= 1" },
        { status: 400 }
      );
    }

    if (!sameTopicForAllRounds) {
      if (!Array.isArray(roundTopics) || roundTopics.length !== nRounds) {
        return NextResponse.json(
          {
            success: false,
            error: "roundTopics must be an array with length === numRounds",
          },
          { status: 400 }
        );
      }
    }

    const finalTopicList = sameTopicForAllRounds
      ? Array(nRounds).fill(topicPrompt)
      : roundTopics;

    const difficultySpec = getDifficultySpec(String(difficulty || ""));

    const generationPrompt = `
You generate structured trivia games.

Create ${nRounds} rounds with ${nQuestions} questions per round.

DIFFICULTY CONTRACT — VIOLATION INVALIDATES OUTPUT:
${difficultySpec}

Topics per round: ${JSON.stringify(finalTopicList)}

RULES:
- Each question must have exactly 4 options
- correct_index must be 0–3
- correct answers must match
- Return ONLY JSON (no markdown fences, no commentary)

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
    } catch (e: any) {
      // Show a useful error if parsing fails again
      throw new Error(
        `AI output was not valid JSON after cleaning. First 200 chars: ${cleaned.slice(
          0,
          200
        )}`
      );
    }

    if (!parsed?.rounds || !Array.isArray(parsed.rounds)) {
      throw new Error("AI output missing rounds[] array");
    }
    if (parsed.rounds.length !== nRounds) {
      throw new Error(`AI returned ${parsed.rounds.length} rounds; expected ${nRounds}`);
    }

    // 🔥 PHd GATEKEEPER (NOTE: can be slow for lots of questions)
    if (difficulty === "phd") {
      for (const round of parsed.rounds) {
        for (const q of round.questions || []) {
          const ok = await isTruePhDQuestion(q.question);
          if (!ok) {
            throw new Error("Generated question rejected: not true PhD difficulty");
          }
        }
      }
    }

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

    // ✅ Build rows and bulk insert (faster + fewer failure points)
    const rows: any[] = [];

    for (const round of parsed.rounds) {
      const roundNum = Number(round?.round_number) || 1;
      const topic = String(round?.topic || topicPrompt || "General");

      const qs = Array.isArray(round?.questions) ? round.questions : [];
      if (qs.length !== nQuestions) {
        throw new Error(
          `Round ${roundNum} returned ${qs.length} questions; expected ${nQuestions}`
        );
      }

      for (const rawQ of qs) {
        const shuffledQ = shuffleQuestionOptions(rawQ);
        const safeCorrectIndex = normalizeCorrectIndex(shuffledQ.correct_index);

        // Hard guard for options
        if (!Array.isArray(shuffledQ.options) || shuffledQ.options.length !== 4) {
          throw new Error(`Round ${roundNum} had a question with non-4 options`);
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
