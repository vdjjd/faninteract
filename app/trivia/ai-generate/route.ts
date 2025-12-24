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
 * Safety: AI never controls correctness
 */
function normalizeCorrectIndex(index: any): number {
  if (typeof index !== "number") return Math.floor(Math.random() * 4);
  if (index < 0 || index > 3) return Math.floor(Math.random() * 4);
  return index;
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
  try {
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
    } = await req.json();

    const finalTopicList = sameTopicForAllRounds
      ? Array(numRounds).fill(topicPrompt)
      : roundTopics;

    const difficultySpec = getDifficultySpec(difficulty);

    const generationPrompt = `
You generate structured trivia games.

Create ${numRounds} rounds with ${numQuestions} questions per round.

DIFFICULTY CONTRACT — VIOLATION INVALIDATES OUTPUT:
${difficultySpec}

Topics per round: ${JSON.stringify(finalTopicList)}

RULES:
- Each question must have exactly 4 options
- correct_index must be 0–3
- correct answers must match
- For PhD difficulty: prefer controversial, edge-case, or debated questions

Return ONLY valid JSON:
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

    const rawText = response.output_text;
    if (!rawText) throw new Error("AI returned no output");

    const parsed = JSON.parse(rawText);

    // 🔥 PHd GATEKEEPER
    if (difficulty === "phd") {
      for (const round of parsed.rounds) {
        for (const q of round.questions) {
          const ok = await isTruePhDQuestion(q.question);
          if (!ok) {
            throw new Error(
              "Generated question rejected: not true PhD difficulty"
            );
          }
        }
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create trivia card
    const { data: triviaCard, error: triviaErr } = await supabase
      .from("trivia_cards")
      .insert({
        host_id: hostId,
        public_name: publicName,
        private_name: privateName,
        topic_prompt: topicPrompt,
        difficulty,
        question_count: numQuestions,
        rounds: numRounds,
        per_round_topics: sameTopicForAllRounds ? null : roundTopics,
        status: "inactive",
      })
      .select()
      .single();

    if (triviaErr) throw triviaErr;

    // Insert questions
    for (const round of parsed.rounds) {
      for (const q of round.questions) {
        const safeCorrectIndex = normalizeCorrectIndex(q.correct_index);

        const { error } = await supabase
          .from("trivia_questions")
          .insert({
            trivia_card_id: triviaCard.id,
            round_number: round.round_number,
            question_text: q.question,
            options: q.options,
            correct_index: safeCorrectIndex,
            difficulty,
            category: round.topic,
          });

        if (error) throw error;
      }
    }

    return NextResponse.json({ success: true, triviaId: triviaCard.id });

  } catch (err: any) {
    console.error("❌ TRIVIA GENERATION FAILED:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
