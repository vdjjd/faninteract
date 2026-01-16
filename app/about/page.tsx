"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function AboutPage() {
  return (
    <main
      className={cn(
        "relative w-full min-h-screen",
        "overflow-x-hidden",
        "text-white",
        "px-4 md:px-0"
      )}
    >
      {/* Background (match landing vibe) */}
      <div
        className={cn(
          "absolute inset-0",
          "bg-[linear-gradient(135deg,#0a2540,#1b2b44,#000000)]",
          "bg-[length:200%_200%]",
          "animate-gradient-slow"
        )}
      />
      <div
        className={cn(
          "absolute inset-0 opacity-25",
          "bg-[radial-gradient(circle_at_30%_30%,rgba(0,153,255,0.4),transparent_70%)]"
        )}
      />

      {/* Top Nav */}
      <header className={cn('relative', 'z-20', 'mx-auto', 'w-full', 'max-w-6xl', 'py-6', 'flex', 'items-center', 'justify-between')}>
        <Link href="/" className={cn('flex', 'items-center', 'gap-3')}>
          <img
            src="/faninteractlogo-landing.png"
            alt="FanInteract"
            className={cn('h-10', 'w-auto')}
          />
        </Link>

        <nav className={cn('flex', 'items-center', 'gap-3')}>
          <Link
            href="/"
            className={cn(
              "text-sm font-semibold",
              "text-sky-300/90 hover:text-sky-200",
              "px-3 py-2 rounded-xl",
              "border border-sky-400/20 hover:border-sky-300/40",
              "bg-white/0 hover:bg-white/5",
              "transition-all duration-200"
            )}
          >
            Home
          </Link>

          <Link
            href="/login"
            className={cn(
              "text-sm font-semibold",
              "px-3 py-2 rounded-xl",
              "border border-white/15 text-white/85",
              "hover:bg-white/5 hover:text-white",
              "transition-all duration-200"
            )}
          >
            Login
          </Link>

          <Link
            href="/"
            className={cn(
              "text-sm font-semibold",
              "px-4 py-2 rounded-xl",
              "bg-gradient-to-r from-sky-500 to-blue-600",
              "shadow-lg shadow-blue-600/30",
              "hover:shadow-blue-500/50 hover:scale-[1.02]",
              "transition-all duration-200"
            )}
          >
            Get Started
          </Link>
        </nav>
      </header>

      {/* Content */}
      <section className={cn('relative', 'z-10', 'mx-auto', 'w-full', 'max-w-6xl', 'pb-16')}>
        {/* Hero */}
        <div className={cn('pt-8', 'md:pt-14', 'text-center')}>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className={cn(
              "font-extrabold tracking-tight",
              "bg-clip-text text-transparent",
              "bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-400",
              "drop-shadow-[0_0_30px_rgba(56,189,248,0.25)]",
              "text-3xl sm:text-4xl md:text-6xl"
            )}
          >
            FanInteract turns your audience into the show.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.08 }}
            className={cn(
              "mt-5 mx-auto",
              "max-w-3xl",
              "text-gray-300 leading-relaxed",
              "text-base sm:text-lg md:text-xl"
            )}
          >
            FanInteract is a live engagement platform that lets guests post messages and photos,
            play interactive games, vote in polls, and join real-time experiences — all on one
            beautifully branded wall that you control.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.16 }}
            className={cn('mt-8', 'flex', 'flex-wrap', 'items-center', 'justify-center', 'gap-4')}
          >
            <Link
              href="/"
              className={cn(
                "px-8 py-4 rounded-2xl font-semibold",
                "bg-gradient-to-r from-sky-500 to-blue-600",
                "shadow-lg shadow-blue-600/35",
                "hover:scale-105 hover:shadow-blue-500/60",
                "transition-all duration-300"
              )}
            >
              Start Free Setup
            </Link>

            <Link
              href="/login"
              className={cn(
                "px-8 py-4 rounded-2xl font-semibold",
                "border border-sky-400 text-sky-300",
                "hover:bg-sky-400/10",
                "transition-all duration-300"
              )}
            >
              Login
            </Link>
          </motion.div>

          {/* Value bullets */}
          <div className={cn('mt-10', 'grid', 'grid-cols-1', 'md:grid-cols-3', 'gap-4', 'text-left')}>
            {[
              {
                title: "Built for real-time moments",
                text: "Guests participate instantly with their phones, while you control what shows on the wall in real time.",
              },
              {
                title: "Brand it like it’s yours",
                text: "Customize backgrounds, colors, gradients, layouts, timing, and behavior — so every event looks intentional.",
              },
              {
                title: "Moderation-first, always",
                text: "Approve, reject, and manage content fast. Keep the vibe clean while still feeling spontaneous.",
              },
            ].map((b, idx) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.12 + idx * 0.06 }}
                className={cn(
                  "rounded-3xl",
                  "border border-blue-900/40",
                  "bg-[#0b111d]/55 backdrop-blur-sm",
                  "p-6"
                )}
              >
                <h3 className={cn('text-lg', 'font-semibold', 'text-white')}>{b.title}</h3>
                <p className={cn('mt-2', 'text-gray-300')}>{b.text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* What it does */}
        <div className={cn('mt-14', 'md:mt-20', 'grid', 'grid-cols-1', 'lg:grid-cols-2', 'gap-8')}>
          <div
            className={cn(
              "rounded-3xl border border-blue-900/40",
              "bg-[#0b111d]/55 backdrop-blur-sm",
              "p-7 md:p-9"
            )}
          >
            <h2 className={cn('text-2xl', 'md:text-3xl', 'font-bold')}>
              What FanInteract is
            </h2>
            <p className={cn('mt-3', 'text-gray-300', 'leading-relaxed')}>
              FanInteract is an engagement engine for venues, events, and brands.
              It gives you a live “crowd interface” — guests scan, join, and participate —
              while your team runs the experience from a simple dashboard.
            </p>

            <div className={cn('mt-6', 'space-y-3', 'text-gray-300')}>
              <div className={cn('flex', 'gap-3')}>
                <span className={cn('mt-1', 'h-2', 'w-2', 'rounded-full', 'bg-sky-400')} />
                <p>
                  A single system that covers <span className="text-white">social posting</span>,
                  <span className="text-white"> games</span>, and <span className="text-white">interactive moments</span>.
                </p>
              </div>
              <div className={cn('flex', 'gap-3')}>
                <span className={cn('mt-1', 'h-2', 'w-2', 'rounded-full', 'bg-sky-400')} />
                <p>
                  Designed to look clean on a big display while staying fast on phones.
                </p>
              </div>
              <div className={cn('flex', 'gap-3')}>
                <span className={cn('mt-1', 'h-2', 'w-2', 'rounded-full', 'bg-sky-400')} />
                <p>
                  Built to scale from a single event to multi-venue operations.
                </p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "rounded-3xl border border-blue-900/40",
              "bg-[#0b111d]/55 backdrop-blur-sm",
              "p-7 md:p-9"
            )}
          >
            <h2 className={cn('text-2xl', 'md:text-3xl', 'font-bold')}>
              What it’s capable of
            </h2>

            <div className={cn('mt-5', 'grid', 'grid-cols-1', 'sm:grid-cols-2', 'gap-4')}>
              {[
                {
                  title: "Fan Wall",
                  text: "Guests post messages and photos that appear live after moderation.",
                },
                {
                  title: "Prize Wheel",
                  text: "Collect entries and trigger winner notifications instantly.",
                },
                {
                  title: "Live Polls",
                  text: "Run quick votes and reveal results in real time.",
                },
                {
                  title: "Trivia & Games",
                  text: "Create interactive play moments that keep the crowd engaged.",
                },
                {
                  title: "Brand Controls",
                  text: "Colors, gradients, layouts, transitions, timers, and more.",
                },
                {
                  title: "Operator Dashboard",
                  text: "Start/stop, clear, moderate, and manage experiences in seconds.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className={cn(
                    "rounded-2xl",
                    "border border-white/10",
                    "bg-white/5",
                    "p-4"
                  )}
                >
                  <div className={cn('font-semibold', 'text-white')}>{f.title}</div>
                  <div className={cn('mt-1', 'text-sm', 'text-gray-300', 'leading-relaxed')}>
                    {f.text}
                  </div>
                </div>
              ))}
            </div>

            <p className={cn('mt-6', 'text-gray-300', 'leading-relaxed')}>
              The point is simple: FanInteract creates a feedback loop where your crowd isn’t
              just watching — they’re participating, laughing, competing, and staying longer.
            </p>
          </div>
        </div>

        {/* Why it sells */}
        <div className={cn('mt-14', 'md:mt-20')}>
          <div
            className={cn(
              "rounded-3xl border border-blue-900/40",
              "bg-[#0b111d]/55 backdrop-blur-sm",
              "p-7 md:p-10"
            )}
          >
            <h2 className={cn('text-2xl', 'md:text-3xl', 'font-bold', 'text-center')}>
              Why clients choose FanInteract
            </h2>

            <div className={cn('mt-8', 'grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-4', 'gap-4')}>
              {[
                {
                  title: "More energy",
                  text: "Interactive moments create a louder, stickier atmosphere.",
                },
                {
                  title: "More retention",
                  text: "People stay longer when they’re part of what’s happening.",
                },
                {
                  title: "More participation",
                  text: "Phones become the remote control for the room — frictionless.",
                },
                {
                  title: "More control",
                  text: "Moderation and operator tools keep it fun, not chaotic.",
                },
              ].map((c) => (
                <div
                  key={c.title}
                  className={cn(
                    "rounded-2xl",
                    "border border-white/10",
                    "bg-white/5",
                    "p-5"
                  )}
                >
                  <div className={cn('font-semibold', 'text-white')}>{c.title}</div>
                  <div className={cn('mt-2', 'text-sm', 'text-gray-300', 'leading-relaxed')}>
                    {c.text}
                  </div>
                </div>
              ))}
            </div>

            <div className={cn('mt-10', 'grid', 'grid-cols-1', 'lg:grid-cols-2', 'gap-6')}>
              <div className={cn('rounded-2xl', 'border', 'border-white/10', 'bg-white/5', 'p-6')}>
                <h3 className={cn('text-lg', 'font-semibold', 'text-white')}>
                  Built for the real world
                </h3>
                <p className={cn('mt-2', 'text-gray-300', 'leading-relaxed')}>
                  Crowd content is unpredictable. FanInteract is designed with operator control,
                  quick moderation, and simple “show flow” so you can run it without slowing
                  down the event.
                </p>
              </div>
              <div className={cn('rounded-2xl', 'border', 'border-white/10', 'bg-white/5', 'p-6')}>
                <h3 className={cn('text-lg', 'font-semibold', 'text-white')}>
                  A platform, not a one-off feature
                </h3>
                <p className={cn('mt-2', 'text-gray-300', 'leading-relaxed')}>
                  Start with a Fan Wall, add a Prize Wheel, run trivia nights, launch polls —
                  FanInteract grows with your venue and gives you new ways to monetize events.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className={cn('mt-14', 'md:mt-20')}>
          <div
            className={cn(
              "rounded-3xl border border-blue-900/40",
              "bg-[#0b111d]/55 backdrop-blur-sm",
              "p-7 md:p-10"
            )}
          >
            <h2 className={cn('text-2xl', 'md:text-3xl', 'font-bold', 'text-center')}>
              Quick FAQ
            </h2>

            <div className={cn('mt-8', 'grid', 'grid-cols-1', 'lg:grid-cols-2', 'gap-4')}>
              {[
                {
                  q: "Do guests need to download an app?",
                  a: "No. Guests join from their phone browser after scanning a QR code.",
                },
                {
                  q: "Can I control what shows on screen?",
                  a: "Yes. FanInteract is moderation-first. You approve, reject, and manage content quickly.",
                },
                {
                  q: "Is this only for one type of venue?",
                  a: "No. FanInteract works for bars, events, arenas, festivals, corporate activations, and more.",
                },
                {
                  q: "Can we brand it for each client or event?",
                  a: "Yes. You can customize the look and behavior to match the client, theme, or sponsor.",
                },
              ].map((item) => (
                <div
                  key={item.q}
                  className={cn('rounded-2xl', 'border', 'border-white/10', 'bg-white/5', 'p-6')}
                >
                  <div className={cn('font-semibold', 'text-white')}>{item.q}</div>
                  <div className={cn('mt-2', 'text-gray-300', 'leading-relaxed')}>{item.a}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className={cn('mt-10', 'flex', 'flex-wrap', 'justify-center', 'gap-4')}>
              <Link
                href="/"
                className={cn(
                  "px-8 py-4 rounded-2xl font-semibold",
                  "bg-gradient-to-r from-sky-500 to-blue-600",
                  "shadow-lg shadow-blue-600/35",
                  "hover:scale-105 hover:shadow-blue-500/60",
                  "transition-all duration-300"
                )}
              >
                Get Started
              </Link>

              <Link
                href="/login"
                className={cn(
                  "px-8 py-4 rounded-2xl font-semibold",
                  "border border-sky-400 text-sky-300",
                  "hover:bg-sky-400/10",
                  "transition-all duration-300"
                )}
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={cn('relative', 'z-20', 'border-t', 'border-blue-900/40', 'bg-[#0b111d]/80', 'backdrop-blur-sm')}>
        <div className={cn('mx-auto', 'max-w-6xl', 'px-4', 'md:px-0', 'py-8', 'text-center')}>
          <div className={cn('flex', 'flex-wrap', 'items-center', 'justify-center', 'gap-4', 'text-sm')}>
            <Link href="/" className={cn('text-sky-300/80', 'hover:text-sky-200', 'transition-colors')}>
              Home
            </Link>
            <span className="text-gray-600">•</span>
            <Link href="/privacy" className={cn('text-sky-300/80', 'hover:text-sky-200', 'transition-colors')}>
              Privacy
            </Link>
            <span className="text-gray-600">•</span>
            <Link href="/terms" className={cn('text-sky-300/80', 'hover:text-sky-200', 'transition-colors')}>
              Terms
            </Link>
          </div>

          <p className={cn('mt-3', 'text-gray-500', 'text-sm')}>
            © {new Date().getFullYear()} FanInteract. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
