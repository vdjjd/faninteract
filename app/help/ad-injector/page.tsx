import Link from "next/link";
import { cn } from "../../../lib/utils";

const NAV = [
  { title: "Help Home", href: "/help", icon: "🏠" },
  { title: "Ad Injector", href: "/help/ad-injector", icon: "📺" },
  { title: "Ad Builder", href: "/help/ad-builder", icon: "🧱" },
  { title: "Fan Zone Wall", href: "/help/fan-zone-wall", icon: "🎤" },
  { title: "Trivia", href: "/help/trivia", icon: "🧠" },
  { title: "Polls", href: "/help/polls", icon: "📊" },
  { title: "Prizewheel", href: "/help/prizewheel", icon: "🎡" },
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
                    n.href === "/help/ad-injector" ? "bg-white/10" : "bg-black/30"
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

export default function AdInjectorHelpPage() {
  return (
    <Shell
      title="📺 Ad Injector Help"
      subtitle="Inject sponsor/promotional slides into your screen rotation at the right moment."
    >
      <div className="space-y-8">
        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>What it does</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Select ad slides (built in Ad Builder).</li>
            <li>Run them on your screens in-between moments (or on a schedule).</li>
            <li>Keep sponsors happy without manually swapping screens all night.</li>
          </ul>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Quick Start</h2>
          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Build ads in <b>Ad Builder</b> first.</li>
            <li>In <b>Ad Injector</b>, select which ads you want active for the event.</li>
            <li>Choose how they run (rotation / manual trigger / schedule).</li>
            <li>Launch your display and confirm ads are cycling the way you want.</li>
          </ol>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Best practices</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Keep ads short (3–8 seconds per slide is usually perfect).</li>
            <li>Use ads during transitions: before trivia starts, between songs, during downtime.</li>
            <li>Don’t overdo it—ads work best when they feel like part of the show.</li>
          </ul>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Troubleshooting</h2>
          <ul className={cn('mt-3', 'space-y-3', 'text-white/80')}>
            <li>
              <b>“Ads aren’t showing”</b>
              <div className="text-white/70">Confirm the ads are selected/active for the event and your display page is open.</div>
            </li>
            <li>
              <b>“Ads show but timing feels wrong”</b>
              <div className="text-white/70">Reduce the ad count or shorten duration. Too many ads makes it feel spammy.</div>
            </li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}
