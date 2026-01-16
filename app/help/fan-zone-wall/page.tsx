import Link from "next/link";
import { cn } from "../../../lib/utils";

const NAV = [
  { title: "Help Home", href: "/help", icon: "🏠" },
  { title: "Ad Injector", href: "/help/ad-injector", icon: "📺" },
  { title: "Ad Builder", href: "/help/ad-builder", icon: "🧱" },
  { title: "Trivia", href: "/help/trivia", icon: "🧠" },
  { title: "Polls", href: "/help/polls", icon: "📊" },
  { title: "Prizewheel", href: "/help/prizewheel", icon: "🎡" },
  { title: "Fan Zone Wall", href: "/help/fan-zone-wall", icon: "🎤" },
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
                    n.href === "/help/fan-zone-wall" ? "bg-white/10" : "bg-black/30"
                  }`}
                >
                  <span className="mr-2">{n.icon}</span>
                  {n.title}
                </Link>
              ))}
            </nav>

            <div className={cn('mt-4', 'rounded-lg', 'border', 'border-white/10', 'bg-black/30', 'p-3', 'text-xs', 'text-white/70')}>
              Pro tip: Keep the wall running on multiple screens. Guests post once — you reuse it everywhere.
            </div>
          </aside>

          <main className={cn('rounded-xl', 'border', 'border-white/10', 'bg-white/5', 'p-6')}>{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function FanZoneWallHelpPage() {
  return (
    <Shell
      title="🎤 Fan Zone Wall Help"
      subtitle="Selfies + messages from guests, displayed on your screens. Includes moderation + wedding guestbook export."
    >
      <div className="space-y-8">
        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>What it does</h2>
          <ul className={cn('mt-3', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Guests scan the wall QR, take a selfie, and leave a message.</li>
            <li>You approve posts (moderation), then display them live on the wall screen.</li>
            <li>Perfect for weddings: export the wall as a printable guestbook (one post per page, no QR).</li>
          </ul>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Quick Start (5 minutes)</h2>
          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Create your Fan Zone Wall inside your dashboard.</li>
            <li>Set the wall <b>background</b> and (optional) <b>logo</b> (for weddings, use the couple monogram).</li>
            <li>Click <b>Launch</b> to open the wall display window on your computer.</li>
            <li>Guests start posting → click <b>Pending</b> → approve posts.</li>
            <li>Click <b>Play</b> to go live on the wall screen.</li>
          </ol>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Daily operation</h2>

          <div className={cn('mt-4', 'grid', 'grid-cols-1', 'gap-4', 'md:grid-cols-2')}>
            <div className={cn('rounded-lg', 'border', 'border-white/10', 'bg-black/40', 'p-4')}>
              <h3 className="font-bold">Buttons (what they mean)</h3>
              <ul className={cn('mt-2', 'space-y-2', 'text-white/80')}>
                <li><b>🚀 Launch</b>: opens the wall display window.</li>
                <li><b>▶️ Play</b>: starts showing approved posts on the wall display.</li>
                <li><b>⏹ Stop</b>: returns the display to inactive mode.</li>
                <li><b>🧹 Clear</b>: clears posts for that wall (use carefully).</li>
                <li><b>⚙ Options</b>: background, title, transitions, countdown, etc.</li>
                <li><b>🕓 Pending</b>: moderation queue (approve / reject / delete).</li>
              </ul>
            </div>

            <div className={cn('rounded-lg', 'border', 'border-white/10', 'bg-black/40', 'p-4')}>
              <h3 className="font-bold">Best practices</h3>
              <ul className={cn('mt-2', 'list-disc', 'space-y-2', 'pl-6', 'text-white/80')}>
                <li>Keep the wall running early so posts build up before peak moments.</li>
                <li>Use a readable background (high contrast helps).</li>
                <li>Approve posts in batches so the wall stays clean and fast.</li>
                <li>For weddings: set the logo to the couple monogram and export later.</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className={cn('text-xl', 'font-bold')}>Wedding Guestbook Export (Print to PDF)</h2>
          <p className={cn('mt-2', 'text-white/70')}>
            This export creates a print-ready layout where <b>each approved post becomes one page</b>. No QR code.
          </p>

          <ol className={cn('mt-3', 'list-decimal', 'space-y-2', 'pl-6', 'text-white/80')}>
            <li>Make sure posts are approved (pending posts won’t show).</li>
            <li>Open the wall’s <b>Export</b> tab.</li>
            <li>Click <b>Export Guestbook (Print / Save as PDF)</b>.</li>
            <li>In your browser: <b>Print → Save as PDF</b>.</li>
          </ol>

          <div className={cn('mt-4', 'rounded-lg', 'border', 'border-white/10', 'bg-black/30', 'p-4', 'text-sm', 'text-white/80')}>
            <b>Tip:</b> Keep the logo set to the couple monogram. The export uses that logo so the printed book feels custom.
          </div>
        </section>

        <section className={cn('rounded-xl', 'border', 'border-white/10', 'bg-black/30', 'p-5')}>
          <h2 className={cn('text-xl', 'font-bold')}>Troubleshooting</h2>
          <ul className={cn('mt-3', 'space-y-3', 'text-white/80')}>
            <li>
              <b>“Pending count is increasing but wall is empty”</b>
              <div className="text-white/70">Approve posts in Pending first. Only approved posts display.</div>
            </li>
            <li>
              <b>“Launch button doesn’t open anything on my phone”</b>
              <div className="text-white/70">Launch is intentionally disabled on mobile. Use a laptop/desktop.</div>
            </li>
            <li>
              <b>“Export link 404s”</b>
              <div className="text-white/70">
                Confirm your export route exists at <code className={cn('rounded', 'bg-white/10', 'px-1')}>app/api/export/fanwall/guestbook/route.ts</code> and your button opens
                <code className={cn('rounded', 'bg-white/10', 'px-1')}>/api/export/fanwall/guestbook?wallId=...</code>. Restart dev server after adding a new route.
              </div>
            </li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}
