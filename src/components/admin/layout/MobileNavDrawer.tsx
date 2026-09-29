"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";

/**
 * Hamburger button + left slide-over that renders the portal's sidebar nav
 * on screens below `lg`. Radix Dialog supplies focus trapping, Escape to
 * close and body scroll lock. Tapping any link inside closes the drawer.
 */
export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // The shell lives in a layout, so it survives navigation. Close the drawer
  // whenever the route changes some other way (browser back/forward gesture)
  // instead of leaving it open over the new page.
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Close it if the viewport grows into the desktop layout (e.g. rotating a
  // tablet), where the trigger is hidden and the sidebar takes over.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        {/* Safe-area padding: the app is a standalone PWA with
            viewport-fit=cover, so the status bar and home indicator would
            otherwise cover the brand row and the Exit button. */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-lg outline-none"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          {children}
          <DialogPrimitive.Close
            className="absolute right-2 top-[calc(0.75rem+env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
