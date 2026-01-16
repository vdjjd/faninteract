import Link from "next/link";
import { cn } from "../../lib/utils";

const SECTIONS = [
  {
    title: "Ad Injector",
    href: "/help/ad-injector",
    icon: "📺",
    summary: "Run pre-made ads on your screens at the right time, without breaking your flow.",
  },
  {
    title: "Ad Builder",
    href: "/help/ad-builder",
    icon: "🧱",
    summary: "Create clean, reusable ad slides (logos, text, sponsors, promos) that look pro on a big screen.",
  },
  {
    title: "Trivia",
    href: "/help/trivia",
    icon: "🧠",
    summary: "Build question sets, run a live game, and keep guests engaged between moments.",
  },
  {
    title: "Polls",
    href: "/help/polls",
    icon: "📊",
    summary: "Ask the crowd questions and display results live on the screen.",
  },
  {
    title: "Prizewheel",
    href: "/help/prizewheel",
    icon: "🎡",
    summary: "Spin-to-win moments for giveaways, contests, and crowd hype.",
  },
  {
    title: "Fan Zone Wall",
    href: "/help/fan-zone-wall",
    icon: "🎤",
    summary: "Guest selfie + message wall. Moderate posts and display on one or many screens.",
  },
];

function HelpShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-h-screen', 'bg-black', 'text-white')}>
      <div className={cn('mx-auto', 'max-w-6xl', 'px-4', 'py-10')}>
        <div className={cn('flex', 'flex-col', 'gap-2')}>
          <h1 className={cn('text-3xl', 'font-extrabold', 'tracking-tight')}>{title}</h1>
          {subtitle ? <p className="text-white/70">{subtitle}</p> : null}
        </div>

        <div className={cn('mt-8', 'grid', 'grid-cols-1', 'gap-6', 'md:grid-cols-[260px_1fr]')}>
          {/* Left nav */}
          <aside className={cn('rounded-xl', 'border', 'border-white/10', 'bg-white/5', 'p-4')}>
            <div className={cn('text-sm', 'font-semibold', 'text-white/80')}>Help Sections</div>
            <nav className={cn('mt-3', 'flex', 'flex-col', 'gap-2', 'text-sm')}>
              {SECTIONS.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className={cn('rounded-lg', 'border', 'border-white/10', 'bg-black/30', 'px-3', 'py-2', 'hover:bg-black/50')}
                >
                  <span className="mr-2">{s.icon}</span>
                  {s.title}
                </Link>
              ))}
            </nav>

            <div className={cn('mt-4', 'rounded-lg', 'border', 'border-white/10', 'bg-black/30', 'p-3', 'text-xs', 'text-white/70')}>
              Tip: If something isn’t working, start with the Troubleshooting section on that feature page.
            </div>
          </aside>

          {/* Main */}
          <main className={cn('rounded-xl', 'border', 'border-white/10', 'bg-white/5', 'p-6')}>{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function HelpHomePage() {
  return (
    <HelpShell
      title="FanInteract Help Center"
      subtitle="Step-by-step instructions for running every feature (like a manual)."
    >
      <div className="space-y-6">
        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Start here</h2>
          <p className={cn('mt-2', 'text-white/70')}>
            FanInteract is built for real events. The fastest way to learn is:
          </p>
          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Pick the feature you’re using (Fan Zone Wall, Trivia, Polls, Prizewheel, Ads).</li>
            <li>Follow the “Quick Start” section.</li>
            <li>Use “Troubleshooting” if anything acts weird (90% of issues are simple).</li>
          </ol>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Features</h2>
          <div className={cn('mt-4', 'grid', 'grid-cols-1', 'gap-4', 'md:grid-cols-2')}>
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={cn('group', 'rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5', 'hover:bg-black/40')}
              >
                <div className={cn('flex', 'items-start', 'justify-between', 'gap-3')}>
                  <div>
                    <div className={cn('text-lg', 'font-extrabold')}>
                      <span className="mr-2">{s.icon}</span>
                      {s.title}
                    </div>
                    <p className={cn('mt-2', 'text-sm', 'text-white/70')}>{s.summary}</p>
                  </div>
                  <div className={cn('text-white/50', 'group-hover:text-white/80')}>→</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Common event workflow</h2>
          <p className={cn('mt-2', 'text-white/70')}>
            This is a reliable “DJ / host” flow that works at weddings, bars, schools, fairs, and private events:
          </p>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li><b>Early:</b> build your wall / trivia / poll + set backgrounds + logo.</li>
            <li><b>Doors open:</b> run Fan Zone Wall on a main screen so guests start posting.</li>
            <li><b>Downtime:</b> run a poll or trivia round when you need energy without chaos.</li>
            <li><b>Peak moment:</b> prizewheel / big poll reveal / trivia final round.</li>
            <li><b>After:</b> export guestbook (weddings) or export leads (marketing).</li>
          </ul>
        </section>
      </div>
    </HelpShell>
  );
}
