import Link from "next/link";
import { cn } from "../../../lib/utils";

const NAV = [
  { title: "Help Home", href: "/help", icon: "🏠" },
  { title: "Trivia", href: "/help/trivia", icon: "🧠" },
  { title: "Polls", href: "/help/polls", icon: "📊" },
  { title: "Prizewheel", href: "/help/prizewheel", icon: "🎡" },
  { title: "Fan Zone Wall", href: "/help/fan-zone-wall", icon: "🎤" },
  { title: "Ad Builder", href: "/help/ad-builder", icon: "🧱" },
  { title: "Ad Injector", href: "/help/ad-injector", icon: "📺" },
];

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-h-screen', 'bg-black', 'text-white')}>
      <div className={cn('mx-auto', 'max-w-6xl', 'px-4', 'py-10')}>
        <h1 className={cn('text-3xl', 'font-extrabold')}>{title}</h1>
        {subtitle ? <p className={cn('mt-2', 'text-white/70')}>{subtitle}</p> : null}
        <div className={cn('mt-8', 'grid', 'grid-cols-1', 'gap-6', 'md:grid-cols-[260px_1fr]')}>
          <aside className={cn('rounded-xl', 'border', 'border-white/10', 'bg-white/5', 'p-4')}>
            <div className={cn('text-sm', 'font-semibold', 'text-white/80')}>Navigation</div>
            <nav className={cn('mt-3', 'flex', 'flex-col', 'gap-2', 'text-sm')}>
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg border border-white/10 px-3 py-2 hover:bg-black/50 ${
                    n.href === "/help/trivia" ? "bg-white/10" : "bg-black/30"
                  }`}
                >
                  <span className="mr-2">{n.icon}</span>
                  {n.title}
                </Link>
              ))}
            </nav>
            <div className={cn('mt-4', 'rounded-lg', 'border', 'border-white/10', 'bg-black/30', 'p-3', 'text-xs', 'text-white/70')}>
              Tip: Keep your trivia simple at live events—short questions, big fonts, fast pacing.
            </div>
          </aside>
          <main className={cn('rounded-xl', 'border', 'border-white/10', 'bg-white/5', 'p-6')}>{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function TriviaHelpPage() {
  return (
    <Shell
      title="🧠 Trivia Help"
      subtitle="Create questions, build a game, and run it smoothly at live events."
    >
      <div className="space-y-8">
        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>What it does</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create a trivia set (public name, topic prompt, default difficulty/category).</li>
            <li>Add questions manually or import via CSV.</li>
            <li>Add your questions to a game and run it live.</li>
          </ul>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Quick Start</h2>
          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create a Trivia set.</li>
            <li>Add questions (Manual Add or CSV Import).</li>
            <li>Click <b>Add All to Game</b> (or add a subset if you want tighter pacing).</li>
            <li>Launch the Trivia screen and run the round.</li>
          </ol>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Question building rules (important)</h2>
          <ul className={cn('mt-3', 'space-y-2', 'text-white/80')}>
            <li><b>Keep it short:</b> guests are standing, talking, drinking, and distracted.</li>
            <li><b>Answer choices:</b> 4 choices is the sweet spot (A/B/C/D).</li>
            <li>
              <b>Difficulty + Category defaults:</b> If a row is missing difficulty/category (or blank),
              FanInteract can auto-fill defaults (so imports don’t fail).
            </li>
          </ul>

          <div className={cn('mt-4', 'rounded-lg', 'border', 'border-white/10', 'bg-black/40', 'p-4', 'text-sm', 'text-white/80')}>
            <b>Default behavior (Option B):</b> When difficulty/category is blank, the system fills:
            <ul className={cn('mt-2', 'list-disc', 'space-y-1', 'pl-6')}>
              <li><b>Difficulty:</b> trivia.difficulty OR “medium”</li>
              <li><b>Category:</b> trivia.topic_prompt OR trivia.public_name OR “General”</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>CSV Import checklist</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Make sure each row has at least: question text + correct answer.</li>
            <li>Choices should be clean (no weird commas/quotes unless properly escaped).</li>
            <li>If category/difficulty are missing → defaults fill them (Option B).</li>
          </ul>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Troubleshooting</h2>
          <ul className={cn('mt-3', 'space-y-3', 'text-white/80')}>
            <li>
              <b>“My import failed”</b>
              <div className="text-white/70">
                Check for malformed CSV rows (extra commas, unclosed quotes). Also confirm required columns exist.
              </div>
            </li>
            <li>
              <b>“Questions show in bank but not in game”</b>
              <div className="text-white/70">
                Add them to the game using <b>Add All to Game</b> (or your specific add workflow).
              </div>
            </li>
            <li>
              <b>“Text is too long on screen”</b>
              <div className="text-white/70">
                Shorten the question or choices. Live trivia needs fast readability.
              </div>
            </li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}
