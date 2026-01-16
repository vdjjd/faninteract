import Link from "next/link";
import { cn } from "../../../lib/utils";

const NAV = [
  { title: "Help Home", href: "/help", icon: "🏠" },
  { title: "Polls", href: "/help/polls", icon: "📊" },
  { title: "Trivia", href: "/help/trivia", icon: "🧠" },
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
                    n.href === "/help/polls" ? "bg-white/10" : "bg-black/30"
                  }`}
                >
                  <span className="mr-2">{n.icon}</span>
                  {n.title}
                </Link>
              ))}
            </nav>
          </aside>
          <main className={cn('rounded-xl', 'border', 'border-white/10', 'bg-white/5', 'p-6')}>{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function PollsHelpPage() {
  return (
    <Shell
      title="📊 Polls Help"
      subtitle="Ask the crowd a question and display the results live."
    >
      <div className="space-y-8">
        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>What it does</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create a poll with 2–6 answer choices.</li>
            <li>Guests vote from their phone.</li>
            <li>You show results live on the screen.</li>
          </ul>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Quick Start</h2>
          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create a new Poll.</li>
            <li>Write the question + answer options.</li>
            <li>Launch the poll screen.</li>
            <li>Start the poll and let people vote.</li>
            <li>Reveal results when you’re ready.</li>
          </ol>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Best practices</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Keep it simple: “Which song next?” “Team Bride or Team Groom?” “Best decade?”</li>
            <li>Limit choices so the screen stays readable.</li>
            <li>Use polls as a reset button when the room needs a moment.</li>
          </ul>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Troubleshooting</h2>
          <ul className={cn('mt-3', 'space-y-3', 'text-white/80')}>
            <li>
              <b>“Votes aren’t showing”</b>
              <div className="text-white/70">
                Confirm the poll is started (not inactive) and that the poll display page is open.
              </div>
            </li>
            <li>
              <b>“Guests can’t find the poll”</b>
              <div className="text-white/70">
                Make sure your poll QR / join link is visible on the screen and the event is the correct one.
              </div>
            </li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}
