'use client';

import SlideshowCard from './SlideshowCard';
import { cn } from "../../../../lib/utils";

export default function SlideshowGrid({
  slideshows,
  host,
  refreshSlideshows,
  onOpenOptions
}) {
  return (
    <div className={cn("mt-10 w-full max-w-6xl")}>
      <h2 className={cn('text-xl font-semibold mb-3')}>🖼 Slide Shows</h2>

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
        {slideshows.map((show: any) => (
          <SlideshowCard
            key={show.id}
            show={show}
            host={host}
            refreshSlideshows={refreshSlideshows}
            onOpenOptions={onOpenOptions}
          />
        ))}
      </div>
    </div>
  );
}
