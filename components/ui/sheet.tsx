'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof Dialog.Content>,
  React.ComponentPropsWithoutRef<typeof Dialog.Content> & {
    side?: 'left' | 'right' | 'top' | 'bottom';
  }
>(({ side = 'right', className, children, ...props }, ref) => (
  <Dialog.Portal>
    {/* Overlay */}
    <Dialog.Overlay
      className={cn(
        // Darken overlay — Windows-safe color (no alpha bug)
        'fixed inset-0 bg-[#000000]/60 backdrop-blur-sm z-40'
      )}
    />

    <Dialog.Content
      ref={ref}
      className={cn(
        // ❌ REMOVE: bg-white (causes the white panel)
        // ❌ REMOVE: dark:bg-neutral-900

        // ✅ Windows-safe stable dark background
        'fixed z-50 bg-[#0b0f1a]/95 backdrop-blur-xl text-neutral-100 shadow-xl transition-all',

        // Positioning
        side === 'right' && 'top-0 right-0 h-full w-80',
        side === 'left' && 'top-0 left-0 h-full w-80',
        side === 'top' && 'top-0 left-0 w-full h-1/3',
        side === 'bottom' && 'bottom-0 left-0 w-full h-1/3',

        // Preserve user styles
        className
      )}
      {...props}
    >
      {/* Accessibility title (hidden) */}
      <Dialog.Title className="sr-only">Panel</Dialog.Title>

      {children}
    </Dialog.Content>
  </Dialog.Portal>
));
SheetContent.displayName = 'SheetContent';

export const SheetHeader = () => null;
export const SheetTitle = () => null;
