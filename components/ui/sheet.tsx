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
    <Dialog.Overlay 
      className={cn(
        'fixed inset-0 bg-black/40 backdrop-blur-sm z-40'
      )}
    />

    <Dialog.Content
      ref={ref}
      className={cn(
        'fixed z-50 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xl transition-all',
        side === 'right' && 'top-0 right-0 h-full w-80',
        side === 'left' && 'top-0 left-0 h-full w-80',
        side === 'top' && 'top-0 left-0 w-full h-1/3',
        side === 'bottom' && 'bottom-0 left-0 w-full h-1/3',
        className
      )}
      {...props}
    >
      {/* Hidden title for accessibility only */}
      <Dialog.Title className="sr-only">Panel</Dialog.Title>

      {/* No header, no close button */}
      {children}
    </Dialog.Content>
  </Dialog.Portal>
));
SheetContent.displayName = 'SheetContent';

/* Completely removed header and title components */
export const SheetHeader = () => null;
export const SheetTitle = () => null;
