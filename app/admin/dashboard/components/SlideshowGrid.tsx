'use client';

import SlideshowCard from './SlideshowCard';
import { cn } from "../../../../lib/utils";

interface SlideshowGridProps {
  slideshows: any[] | undefined;
  host: any;
  refreshSlideshows: () => Promise<void>;
  onOpenOptions: (show: any) => void;
}

export default function SlideshowGrid({
  slideshows,
  host,
  refreshSlideshows,
  onOpenOptions,
}: SlideshowGridProps) {
  const hasSlideshows =
    Array.isArray(slideshows) && slideshows.length > 0;

  return (
    <div className={cn("mt-10 w-full max-w-6xl")}>
      <h2 className={cn("text-xl font-semibold mb-3")}>
        🖼 Slide Shows
      </h2>

      {/* EMPTY STATE – MATCH Trivia / Prize / Polls STYLE */}
      {!hasSlideshows && (
        <p className={cn("text-sm text-white/60 italic")}>
          No Slide Shows created yet.
        </p>
      )}

      {/* GRID */}
      {hasSlideshows && (
        <div
          className={cn(
            "grid",
            "grid-cols-1",
            "sm:grid-cols-2",
            "md:grid-cols-3",
            "lg:grid-cols-4",
            "gap-5"
          )}
        >
          {slideshows!.map((show: any) => (
            <SlideshowCard
              key={show.id}
              show={show}
              host={host}
              refreshSlideshows={refreshSlideshows}
              onOpenOptions={onOpenOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
