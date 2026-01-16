import Link from "next/link";
import { cn } from "../../../lib/utils";

const NAV = [
  { title: "Help Home", href: "/help", icon: "🏠" },
  { title: "Prizewheel", href: "/help/prizewheel", icon: "🎡" },
  { title: "Polls", href: "/help/polls", icon: "📊" },
  { title: "Trivia", href: "/help/trivia", icon: "🧠" },
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
                    n.href === "/help/prizewheel" ? "bg-white/10" : "bg-black/30"
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

export default function PrizewheelHelpPage() {
  return (
    <Shell
      title="🎡 Prizewheel Help"
      subtitle="A clean, hype giveaway moment. Spin it live and keep the crowd engaged."
    >
      <div className="space-y-8">
        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>What it does</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create a list of prizes (or “outcomes”).</li>
            <li>Launch the wheel display on the screen.</li>
            <li>Spin live when you’re ready.</li>
          </ul>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Quick Start</h2>
          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create a Prizewheel.</li>
            <li>Add prize slices (keep them short so they fit).</li>
            <li>Launch the wheel screen.</li>
            <li>Spin when you want the winner moment.</li>
          </ol>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Best practices</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Use 8–16 slices for a wheel that feels fair and exciting.</li>
            <li>Mix prizes with “try again” if you want longer suspense.</li>
            <li>Announce the rules clearly before spinning.</li>
          </ul>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Troubleshooting</h2>
          <ul className={cn('mt-3', 'space-y-3', 'text-white/80')}>
            <li>
              <b>“Wheel text is cramped”</b>
              <div className="text-white/70">Shorten slice labels. Use fewer words.</div>
            </li>
            <li>
              <b>“Spin button does nothing”</b>
              <div className="text-white/70">Confirm the wheel display is open and the wheel is in a running state.</div>
            </li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}
