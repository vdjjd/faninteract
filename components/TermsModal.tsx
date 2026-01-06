"use client";

import { cn } from "@/lib/utils";

function hasContent(s?: string) {
  if (!s) return false;
  const t = String(s).trim();
  if (!t) return false;
  // protect against literal "null"/"undefined" strings
  if (t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return false;
  return true;
}

/* ------------------ SUPER BASIC MARKDOWN PARSER (slightly safer) ------------------ */
function markdownToHtml(md: string) {
  let html = md;

  // Headings
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Bold/italic/underline
  html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");
  html = html.replace(/__(.*?)__/gim, "<u>$1</u>");

  // Horizontal rules (--- on its own line)
  html = html.replace(/^\s*---\s*$/gim, "<hr/>");

  // Very simple lists: wrap consecutive - items in <ul> ... </ul>
  // 1) mark list items
  html = html.replace(/^\s*-\s+(.*)$/gim, "<li>$1</li>");
  // 2) wrap blocks of <li>...</li> into <ul>
  html = html.replace(/(?:<li>.*<\/li>\s*){1,}/gim, (match) => `<ul>${match}</ul>`);

  // Paragraph-ish breaks
  html = html.replace(/\n{2,}/g, "<br/><br/>");
  html = html.replace(/\n/g, "<br/>");

  return html;
}

export default function TermsModal({
  isOpen,
  onClose,
  hostTerms = "",
  masterTerms = ""
}: {
  isOpen: boolean;
  onClose: () => void;
  hostTerms?: string;
  masterTerms?: string;
}) {
  if (!isOpen) return null;

  /* ------------------ FANINTERACT TERMS (ALWAYS) ------------------ */
  const fanInteractTerms = `
# FanInteract Terms & Conditions

## 1. Content Ownership
You retain ownership of photos, messages, and media you submit.  
You grant FanInteract and event hosts a non-exclusive license to display your content on event screens.

## 2. Safety & Respect
You agree not to upload:
- hateful content  
- nudity or explicit imagery  
- copyrighted material you do not own  
- harmful or deceptive content  

Violations may result in removal or permanent bans.

## 3. Data Usage
FanInteract collects minimal data for event functionality:
- form fields you submit  
- device ID (anonymous)  
- analytics for improving performance  

We do **not** sell personal information.

## 4. Liability
FanInteract is not responsible for:
- lost prizes  
- event-related injuries  
- unauthorized content displayed by other guests  

Platform is provided *as-is*.

## 5. Event Hosts
Event hosts may add additional venue-specific terms.

## 6. Acceptance
Using this service means you accept these terms.
`;

  /* ------------------ BUILD SECTIONS (GUARANTEED) ------------------ */
  const sections: string[] = [];

  // Always include FanInteract
  sections.push(fanInteractTerms.trim());

  // Include Master terms if real content
  if (hasContent(masterTerms)) {
    sections.push(
      `# FanInteract Master Account Terms\n\n${String(masterTerms).trim()}`
    );
  }

  // Include Host terms if real content
  if (hasContent(hostTerms)) {
    sections.push(
      `# Venue / Host Terms\n\n${String(hostTerms).trim()}`
    );
  }

  const combinedMarkdown = sections.join("\n\n---\n\n");
  const html = markdownToHtml(combinedMarkdown);

  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/70 backdrop-blur-md z-[9999]",
        "flex items-center justify-center"
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-[900px] h-[80vh] rounded-2xl",
          "border border-blue-500/30 shadow-[0_0_40px_rgba(0,140,255,0.45)]",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95",
          "p-6 text-white flex flex-col"
        )}
      >
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className={cn(
            "absolute top-3 right-3 text-white/80 hover:text-white text-xl"
          )}
        >
          ✕
        </button>

        {/* TITLE */}
        <h3 className={cn("text-center text-xl font-semibold mb-4")}>
          📜 Terms & Conditions
        </h3>

        {/* CONTENT BOX */}
        <div
          className={cn(
            "flex-grow overflow-y-auto",
            "bg-black/30 border border-white/10 rounded-lg p-5",
            "prose prose-invert max-w-none"
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* FOOTER */}
        <div className={cn("flex justify-center mt-5")}>
          <button
            onClick={onClose}
            className={cn(
              "px-6 py-2 rounded-md bg-white/10 hover:bg-white/20",
              "text-sm font-medium"
            )}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
