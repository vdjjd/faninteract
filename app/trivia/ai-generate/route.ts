
 // app/trivia/ai-generate/route.ts
 // If you want /api/trivia/generate, move this file to:
 // app/api/trivia/generate/route.ts
 
 import { NextResponse } from "next/server";
 import OpenAI from "openai";
 import { createClient } from "@supabase/supabase-js";
 
 export const dynamic = "force-dynamic";
 
 const openai = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY!,
 });
 
 /**
  * Normalize difficulty coming from UI (e.g. "High School", "PhD")
  * into API keys used by getDifficultySpec(): elementary|jr_high|high_school|college|phd
  */
 function normalizeDifficultyKey(
   raw: any
 ): "" | "elementary" | "jr_high" | "high_school" | "college" | "phd" {
   const v = String(raw || "").trim().toLowerCase();
 
   if (v === "elementary") return "elementary";
 
   if (
     v === "jr_high" ||
     v === "junior high" ||
     v === "junior_high" ||
     v === "jr high"
   ) {
     return "jr_high";
   }
 
   if (v === "high_school" || v === "high school" || v === "highschool") {
     return "high_school";
   }
 
   if (v === "college") return "college";
 
   if (v === "phd" || v === "ph.d" || v === "ph.d." || v === "ph d") return "phd";
 
   return "";
 }
 
 /**
  * Difficulty spec for generation prompt
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
  * ✅ Clarify: difficulty = knowledge depth, not wording complexity
  */
 function getDifficultyNote(): string {
   return `
 IMPORTANT DIFFICULTY NOTE:
 - Difficulty labels refer to HOW HARD the knowledge/reasoning is.
 - They do NOT mean "use childish wording" or "write academically."
 - Use clear, modern, concise wording at ALL levels (roughly 8th–10th grade readability).
 - Difficulty must come from concept/knowledge required, not confusing phrasing.
 `;
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
 
 function norm(s: any): string {
   return String(s || "").replace(/\s+/g, " ").trim();
 }
 
 function lowerNorm(s: any): string {
   return norm(s).toLowerCase();
 }
 
+/**
+ * Tunables to reduce regen storms / 500s
+ */
+const MAX_REGEN_TRIES_DEFAULT = 6;
+const DUP_ANSWER_STRICT_ATTEMPTS = 3; // try hard to keep answers unique early, then allow
+
 /**
  * Shuffle options but KEEP the same correct answer,
  * just move it to a random position.
  */
 function shuffleQuestionOptions(q: {
   question: string;
   options: string[];
   correct_index: number;
 }) {
   if (!Array.isArray(q.options) || q.options.length !== 4) {
     return {
       ...q,
       correct_index: normalizeCorrectIndex(q.correct_index),
     };
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
 
   return {
     ...q,
     question: String(q.question || ""),
     options: newOptions,
     correct_index: newCorrectIndex,
   };
 }
 
 /* ============================================================
    ENGINE IMPROVEMENTS
 ============================================================ */
 
 /**
  * ✅ Stronger “same meaning” duplicate detection
  */
 function stripStopwords(s: string) {
   const stop = new Set([
     "the",
     "a",
     "an",
     "of",
     "to",
     "in",
     "on",
     "at",
     "for",
     "and",
     "or",
     "but",
     "with",
     "by",
     "from",
     "is",
     "are",
     "was",
     "were",
     "be",
     "been",
     "being",
     "as",
     "that",
     "this",
     "these",
     "those",
     "which",
     "who",
     "whom",
     "what",
     "when",
     "where",
     "why",
     "how",
     "most",
     "least",
   ]);
 
   return lowerNorm(s)
     .replace(/[^a-z0-9\s]/g, " ")
     .split(" ")
     .filter(Boolean)
     .filter((w) => !stop.has(w))
     .join(" ");
 }
 
 /** Fingerprint stable across light rewording */
 function stemFingerprint(stem: string) {
   const core = stripStopwords(stem);
   const parts = core.split(" ").filter(Boolean).sort();
   return parts.join(" ");
 }
 
 /** Dice similarity on character bigrams (better at paraphrase detection than word Jaccard) */
 function diceBigramSimilarity(a: string, b: string) {
   const A = stripStopwords(a);
   const B = stripStopwords(b);
   if (!A || !B) return 0;
 
   const bigrams = (t: string) => {
     const s = t.replace(/\s+/g, " ");
     const out: string[] = [];
     for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
     return out;
   };
 
   const aB = bigrams(A);
   const bB = bigrams(B);
   if (aB.length === 0 || bB.length === 0) return 0;
 
   const freq = new Map<string, number>();
   for (let i = 0; i < aB.length; i++) {
     const x = aB[i];
     freq.set(x, (freq.get(x) || 0) + 1);
   }
 
   let inter = 0;
   for (let i = 0; i < bB.length; i++) {
     const x = bB[i];
     const c = freq.get(x) || 0;
     if (c > 0) {
       inter++;
       freq.set(x, c - 1);
     }
   }
 
   return (2 * inter) / (aB.length + bB.length);
 }
 
 /**
  * Per-difficulty hard caps (helps stop long answers and giveaways)
  */
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
 
 /**
  * Option “type” classification
  * ✅ FIX: ONLY care about date vs number vs text.
  * Do NOT split person vs phrase (that caused false 500s like "George Strait" vs "The Beatles").
+ * ✅ IMPORTANT: Anything containing letters is TEXT even if it includes digits
+ * (e.g., "Route 66", "The 49ers", "P-51 Mustang").
  */
 function classifyOptionType(opt: string): "number" | "date" | "text" {
   const s = norm(opt);
 
-  // date-ish
-  if (
-    /\b(18|19|20)\d{2}\b/.test(s) ||
-    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(s)
-  ) {
-    return "date";
-  }
-
-  // numeric-ish
-  if (/^[\d,\.\-\+]+$/.test(s)) return "number";
-  if (/\b\d+(\.\d+)?\b/.test(s) && s.length <= 10) return "number";
-
-  return "text";
+  // date-ish: bare year OR month words OR common date formats
+  if (
+    /^\d{4}$/.test(s) ||
+    (/\b(18|19|20)\d{2}\b/.test(s) && !/[a-z]/i.test(s)) ||
+    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(s) ||
+    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)
+  ) return "date";
+
+  // If it contains letters, it's text (even if it also contains digits)
+  if (/[a-z]/i.test(s)) return "text";
+
+  // numeric-only (allow commas/decimals/signs)
+  if (/^[\d,\.\-\+]+$/.test(s)) return "number";
+
+  return "text";
 }
 
-function hasAnyPunct(s: string) {
-  return /[;:()"“”'’—–]/.test(s);
+function hasNotablePunct(s: string) {
+  // ignore apostrophes/hyphens because names/titles have them constantly
+  return /[;:()"“”—–]/.test(s);
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
 
 /**
  * Fairness validator — rejects “pattern giveaway” questions
  */
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
   if (!Array.isArray(cleanOpts) || cleanOpts.length !== 4)
     reasons.push("Options must be exactly 4");
   if (cleanOpts.some((o) => !o)) reasons.push("One or more empty options");
 
   if (cleanStem.length > caps.stemMax)
     reasons.push(`Stem too long (${cleanStem.length} > ${caps.stemMax})`);
   cleanOpts.forEach((o, i) => {
     if (o.length > caps.optMax)
       reasons.push(`Option ${i} too long (${o.length} > ${caps.optMax})`);
     if (o.length < caps.optMin)
       reasons.push(`Option ${i} too short (${o.length} < ${caps.optMin})`);
   });
 
   // type consistency (now date/number/text only)
   const types = cleanOpts.map(classifyOptionType);
   const uniqueTypes = new Set(types);
   if (uniqueTypes.size > 1) {
     reasons.push(`Mixed option types (${Array.from(uniqueTypes).join(", ")})`);
   }
 
-  const periodFlags = cleanOpts.map(endsWithPeriod);
-  if (new Set(periodFlags).size > 1)
-    reasons.push("Mixed punctuation: some options end with '.' and others do not");
+  // ✅ Loosen: period mismatch is common in titles/names; don't fail hard for it.
+  // const periodFlags = cleanOpts.map(endsWithPeriod);
+  // if (new Set(periodFlags).size > 1)
+  //   reasons.push("Mixed punctuation: some options end with '.' and others do not");
 
-  const punctFlags = cleanOpts.map(hasAnyPunct);
-  if (punctFlags.filter(Boolean).length === 1)
-    reasons.push("Only one option has notable punctuation (giveaway)");
+  // ✅ Loosen: punctuation is a weak signal; don't brick the build for it.
+  const punctFlags = cleanOpts.map(hasNotablePunct);
+  if (punctFlags.filter(Boolean).length === 1) {
+    // reasons.push("Only one option has notable punctuation (possible giveaway)");
+  }
 
   const lengths = cleanOpts.map(optionLen);
   const maxLen = Math.max(...lengths);
   const minLen = Math.min(...lengths);
   const correctLen = lengths[ci];
 
   const sorted = [...lengths].sort((a, b) => b - a);
   const longest = sorted[0];
   const second = sorted[1];
 
   const correctIsLongest = correctLen === longest;
   const uniqueLongest = longest > second;
 
   if (correctIsLongest && uniqueLongest) {
     const diff = longest - second;
-    if (diff >= 10 || longest >= Math.floor(second * 1.25)) {
+    if (diff >= 18 || longest >= Math.floor(second * 1.45)) {
       reasons.push("Correct option is uniquely longest (classic giveaway)");
     }
   }
 
-  if (maxLen >= Math.floor(minLen * 2) && maxLen - minLen >= 18) {
+  if (maxLen >= Math.floor(minLen * 2.5) && maxLen - minLen >= 28) {
     reasons.push("Options vary too much in length (pattern giveaway)");
   }
 
   const wcounts = cleanOpts.map(countWords);
   const wMax = Math.max(...wcounts);
   const wMin = Math.min(...wcounts);
-  if (wMax - wMin >= 6)
+  if (wMax - wMin >= 8)
     reasons.push("Options vary too much in word count (shape giveaway)");
 
   const correctOpt = cleanOpts[ci] || "";
   if (
     /\b(always|never|guaranteed|only|all of the above|none of the above)\b/i.test(
       correctOpt
     )
   ) {
     reasons.push("Correct option contains a giveaway absolute/format phrase");
   }
 
   if (
     /\b(NOT|EXCEPT|least likely)\b/i.test(cleanStem) &&
     difficultyKey !== "college" &&
     difficultyKey !== "phd"
   ) {
     reasons.push("Negation-style stem (NOT/EXCEPT) increases ambiguity for this difficulty");
   }
 
   return {
     ok: reasons.length === 0,
     reasons,
     cleaned: { stem: cleanStem, options: cleanOpts, correctIndex: ci },
   };
 }
 
@@ -650,7 +739,7 @@ export async function POST(req: Request) {
     const openerCounts = new Map<string, number>();
 
     // ✅ increased to stop random 500s
-    const MAX_REGEN_TRIES = 6;
+    const MAX_REGEN_TRIES = MAX_REGEN_TRIES_DEFAULT;
 
     const totalQuestions = nRounds * nQuestions;
     // ✅ loosened: allow more repeats before calling "template spam"
     const openerSpamThreshold = Math.max(5, Math.ceil(totalQuestions / 6));
@@ -710,26 +799,33 @@ export async function POST(req: Request) {
           const fp = stemFingerprint(q.question);
-          const duplicateFingerprint = fp && seenStemFingerprints.has(fp);
+          // ✅ fingerprint alone can collide; require high similarity too
+          const duplicateFingerprint =
+            !!fp &&
+            seenStemFingerprints.has(fp) &&
+            seenStems.some((s) => diceBigramSimilarity(s, q.question) >= 0.88);
 
           const stemOpener = getStemOpener(q.question);
           const nextOpenerCount = (openerCounts.get(stemOpener) || 0) + 1;
 
           const tooManySameOpeners = nextOpenerCount >= openerSpamThreshold;
 
           // ✅ stronger paraphrase detection than word-jaccard
           const tooSimilarToPrevious = seenStems.some(
-            (s) => diceBigramSimilarity(s, q.question) >= 0.78
+            (s) => diceBigramSimilarity(s, q.question) >= 0.86
           );
 
           const correctAnswerText = q.options[q.correct_index] || "";
           const answerKey = lowerNorm(correctAnswerText);
           const duplicateAnswer = answerKey && seenAnswers.has(answerKey);
 
-          // ✅ Allow same correct answer in a game UNLESS the stem is also similar
-          const duplicateAnswerAndSimilarStem =
-            duplicateAnswer &&
-            seenStems.some((s) => diceBigramSimilarity(s, q.question) >= 0.7);
+          // ✅ Prefer unique answers early, but don't brick the build forever on narrow topics
+          const shouldRejectDuplicateAnswer =
+            duplicateAnswer && attempt < DUP_ANSWER_STRICT_ATTEMPTS;
 
           let ambiguityFail = false;
           let ambiguityNote: string | undefined;
 
           const shouldAmbiguityCheck =
             difficultyKey === "college" ||
             difficultyKey === "phd" ||
             (!fairness.ok && attempt === 0) ||
-            Math.random() < 0.16; // slightly less spammy
+            Math.random() < 0.05; // much less spammy
 
           if (fairness.ok && shouldAmbiguityCheck) {
             const amb = await ambiguityCheck({
               stem: q.question,
               options: q.options,
               correctIndex: q.correct_index,
             });
             if (!amb.ok) {
               ambiguityFail = true;
               ambiguityNote = amb.note;
             }
           }
 
           const failReasons = [
             ...(fairness.ok ? [] : fairness.reasons),
-            ...(duplicateFingerprint ? ["Duplicate question meaning (fingerprint match)"] : []),
+            ...(duplicateFingerprint ? ["Duplicate question meaning (fingerprint+similarity)"] : []),
             ...(tooManySameOpeners
               ? ["Too many questions start the same way (template spam)"]
               : []),
             ...(tooSimilarToPrevious ? ["Question stem too similar to another question (paraphrase)"] : []),
-            ...(duplicateAnswerAndSimilarStem ? ["Duplicate correct answer + similar question (near-duplicate)"] : []),
+            ...(shouldRejectDuplicateAnswer ? ["Duplicate correct answer (try unique answer)"] : []),
             ...(ambiguityFail ? [`Ambiguity check failed: ${ambiguityNote || "ambiguous"}`] : []),
           ];
 
           if (failReasons.length === 0) {
             openerCounts.set(stemOpener, nextOpenerCount);
             if (answerKey) seenAnswers.add(answerKey);
             if (fp) seenStemFingerprints.add(fp);
             seenStems.push(q.question);
             qs[qi] = q;
             break;
           }
