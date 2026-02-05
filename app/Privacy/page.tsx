"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>

        <p className={cn('mt-4', 'text-gray-400', 'text-sm')}>
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className={cn("mt-10 space-y-8 text-gray-300 leading-relaxed")}>
          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Overview
            </h2>
            <p className="mt-2">
              FanInteract respects your privacy. This Privacy Policy explains how we collect,
              use, and protect information when you use our platform, including guest-facing
              experiences and operator dashboards.
            </p>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Information We Collect
            </h2>
            <ul className={cn('mt-2', 'list-disc', 'list-inside', 'space-y-2')}>
              <li>
                Guest-submitted content such as names, messages, photos, and optional contact
                information when participating in FanInteract experiences.
              </li>
              <li>
                Operator account information including name, email address, and event configuration data.
              </li>
              <li>
                Technical data such as device type, browser, and interaction timing for performance
                and moderation purposes.
              </li>
            </ul>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              How We Use Information
            </h2>
            <ul className={cn('mt-2', 'list-disc', 'list-inside', 'space-y-2')}>
              <li>To display guest content on live event walls and interactive experiences.</li>
              <li>To operate moderation, prize selection, and engagement features.</li>
              <li>To improve performance, reliability, and user experience.</li>
              <li>To send transactional notifications related to prizes or participation.</li>
            </ul>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Data Sharing
            </h2>
            <p className="mt-2">
              FanInteract does not sell guest data. Information may be shared only with:
            </p>
            <ul className={cn('mt-2', 'list-disc', 'list-inside', 'space-y-2')}>
              <li>Event operators running a FanInteract experience.</li>
              <li>Third-party services required to deliver platform features (such as SMS delivery).</li>
              <li>Legal authorities when required by law.</li>
            </ul>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Data Retention
            </h2>
            <p className="mt-2">
              Guest content is retained only as long as necessary for the event experience,
              compliance, or operational needs. Event operators may clear event data at any time.
            </p>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Children’s Privacy
            </h2>
            <p className="mt-2">
              FanInteract is not intended for use by children under 13. We do not knowingly collect
              personal information from children.
            </p>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Your Choices
            </h2>
            <p className="mt-2">
              Participation in FanInteract experiences is voluntary. Guests may choose not to submit
              personal information. Operators control what content is displayed publicly.
            </p>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Changes to This Policy
            </h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. Updates will be reflected on this page.
            </p>
          </section>

          <section>
            <h2 className={cn('text-xl', 'font-semibold', 'text-white')}>
              Contact
            </h2>
            <p className="mt-2">
              If you have questions about this Privacy Policy, please contact us through the FanInteract website.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}