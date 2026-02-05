"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export default function TermsPage() {
  return (
    <main
      className={cn(
        "relative w-full min-h-screen overflow-x-hidden text-white px-4 md:px-0"
      )}
    >
      {/* Background */}
      <div
        className={cn(
          "absolute inset-0",
          "bg-[linear-gradient(135deg,#0a2540,#1b2b44,#000000)]",
          "bg-[length:200%_200%]",
          "animate-gradient-slow"
        )}
      />

      <section className={cn("relative z-10 mx-auto max-w-4xl py-16")}>
        <Link
          href="/"
          className={cn(
            "inline-block mb-6 text-sm text-sky-300 hover:text-sky-200 transition-colors"
          )}
        >
          ← Back to Home
        </Link>

        <h1
          className={cn(
            "text-3xl md:text-4xl font-extrabold tracking-tight",
            "bg-clip-text text-transparent",
            "bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-400"
          )}
        >
          FanInteract Terms of Use
        </h1>

        <p className={cn('mt-4', 'text-gray-400', 'text-sm')}>
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className={cn("mt-10 space-y-8 text-gray-300 leading-relaxed")}>
          {/* Overview */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              1. Overview
            </h2>
            <p className="mt-2">
              FanInteract provides an interactive engagement platform that allows guests
              to submit content, participate in games, polls, and prize experiences, and
              interact with live event displays. By using FanInteract, you agree to these
              Terms of Use.
            </p>
          </section>

          {/* Layered Terms */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              2. Layered Terms & Event Rules
            </h2>
            <p className="mt-2">
              FanInteract provides the platform only. Each event, venue, promoter, DJ,
              operator, or host (collectively, the “Host”) may establish additional
              event-specific terms, rules, or conditions.
            </p>
            <p className="mt-2">
              Any Host or venue terms are presented to you during the signup or participation
              process and apply in addition to FanInteract’s Terms of Use. Because these
              terms vary by event, they are not published on this page.
            </p>
            <p className="mt-2">
              By participating in an event, you acknowledge and agree to both:
            </p>
            <ul className={cn('mt-2', 'list-disc', 'list-inside', 'space-y-1')}>
              <li>FanInteract’s Terms of Use</li>
              <li>The applicable Host or venue terms shown during signup</li>
            </ul>
          </section>

          {/* Content */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              3. User Content
            </h2>
            <p className="mt-2">
              You retain ownership of photos, messages, and media you submit. By submitting
              content, you grant FanInteract and the Host a non-exclusive, royalty-free
              license to display your content as part of the event experience.
            </p>
            <p className="mt-2">
              Submitted content may be moderated, delayed, rejected, or removed at the
              discretion of the Host or FanInteract.
            </p>
          </section>

          {/* Prohibited Content */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              4. Prohibited Content & Conduct
            </h2>
            <p className="mt-2">
              You agree not to submit content that is unlawful, abusive, hateful, explicit,
              deceptive, infringing, or otherwise inappropriate. This includes but is not
              limited to:
            </p>
            <ul className={cn('mt-2', 'list-disc', 'list-inside', 'space-y-1')}>
              <li>Nudity or sexually explicit material</li>
              <li>Hate speech or harassment</li>
              <li>Copyrighted content you do not own or have rights to</li>
              <li>Malicious, misleading, or harmful material</li>
            </ul>
            <p className="mt-2">
              Violations may result in content removal, suspension, or permanent bans.
            </p>
          </section>

          {/* Data & Privacy */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              5. Data & Privacy
            </h2>
            <p className="mt-2">
              FanInteract collects only the minimum data required to operate the platform,
              such as submitted form data, anonymous device identifiers, and operational
              analytics. Data practices are governed by our{" "}
              <Link href="/privacy" className={cn('text-sky-300', 'hover:text-sky-200')}>
                Privacy Policy
              </Link>.
            </p>
          </section>

          {/* Prizes */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              6. Prizes & Promotions
            </h2>
            <p className="mt-2">
              Prizes are administered by the Host unless explicitly stated otherwise.
              FanInteract is not responsible for prize fulfillment, availability,
              substitutions, or disputes.
            </p>
          </section>

          {/* Liability */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              7. Disclaimer & Limitation of Liability
            </h2>
            <p className="mt-2">
              FanInteract is provided on an “as-is” and “as-available” basis. FanInteract
              is not responsible for event conditions, Host actions, guest behavior, lost
              prizes, or injuries related to event participation.
            </p>
          </section>

          {/* Governing */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              8. Governing Terms
            </h2>
            <p className="mt-2">
              If Host or venue terms conflict with FanInteract’s Terms of Use, FanInteract’s
              Terms govern the use of the platform itself, while Host or venue terms govern
              on-site rules, conduct, and prize conditions.
            </p>
          </section>

          {/* Acceptance */}
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              9. Acceptance
            </h2>
            <p className="mt-2">
              By accessing or using FanInteract, you acknowledge that you have read,
              understood, and agreed to these Terms of Use.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
