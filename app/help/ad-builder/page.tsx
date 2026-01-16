import Link from "next/link";
import { cn } from "../../../lib/utils";

const NAV = [
  { title: "Help Home", href: "/help", icon: "🏠" },
  { title: "Ad Builder", href: "/help/ad-builder", icon: "🧱" },
  { title: "Ad Injector", href: "/help/ad-injector", icon: "📺" },
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
                    n.href === "/help/ad-builder" ? "bg-white/10" : "bg-black/30"
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

export default function AdBuilderHelpPage() {
  return (
    <Shell
      title="🧱 Ad Builder Help"
      subtitle="Build clean ad slides that look good on large screens."
    >
      <div className="space-y-8">
        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>What it does</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create “ad slides” (sponsor logos, promo text, event callouts).</li>
            <li>Reuse those slides across events.</li>
            <li>Designed to be readable from far away on a big screen.</li>
          </ul>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Quick Start</h2>
          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create a new ad slide.</li>
            <li>Add your background, logo(s), and headline.</li>
            <li>Preview it full-screen.</li>
            <li>Save it to your library.</li>
          </ol>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Design rules (so it looks pro)</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li><b>Big headline</b> (short): “Tonight’s Sponsor”, “Drink Special”, “Follow Us”.</li>
            <li><b>High contrast</b>: light text on dark background or vice versa.</li>
            <li><b>One message per slide</b>: don’t cram 6 ideas into one screen.</li>
            <li><b>Readable distance test</b>: if you can’t read it 10–20 feet away, it’s too small.</li>
          </ul>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Troubleshooting</h2>
          <ul className={cn('mt-3', 'space-y-3', 'text-white/80')}>
            <li>
              <b>“My logo looks blurry”</b>
              <div className="text-white/70">Upload higher resolution (ideally 1000px+ wide). PNG with transparency is best.</div>
            </li>
            <li>
              <b>“Text is hard to read”</b>
              <div className="text-white/70">Increase font size and/or add a dark overlay behind text.</div>
            </li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}
