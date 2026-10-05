"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PopoverMenuItem {
  key: string;
  label: React.ReactNode;
  /** Plain text for type-ahead and the accessible name. */
  text: string;
  icon?: React.ReactNode;
  /** Set (true or false) to make the item a radio option. */
  checked?: boolean;
}

interface PopoverMenuProps {
  /** Accessible name of the menu. */
  label: string;
  items: PopoverMenuItem[];
  onSelect: (key: string) => void;
  triggerContent: React.ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
  align?: "start" | "end";
  disabled?: boolean;
}

const GAP = 6;

/**
 * A themed dropdown menu. Native <select> popups are drawn by the OS (light
 * grey on a light-mode Mac, whatever the page looks like), so the status and
 * bulk menus use this instead. Portalled with fixed positioning so a list
 * card's overflow never clips it; flips above the trigger near the viewport
 * bottom.
 */
export function PopoverMenu({
  label,
  items,
  onSelect,
  triggerContent,
  triggerClassName,
  triggerTitle,
  align = "start",
  disabled,
}: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setPos(null);
    if (refocus) triggerRef.current?.focus();
  }, []);

  function openMenu(focusLast = false) {
    if (disabled) return;
    const checkedIndex = items.findIndex((i) => i.checked);
    setActive(focusLast ? items.length - 1 : Math.max(0, checkedIndex));
    setOpen(true);
  }

  // Place the menu once it has rendered and can be measured.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - t.bottom >= m.height + GAP + 8 || t.top < m.height + GAP + 8;
    const top = below ? t.bottom + GAP : t.top - GAP - m.height;
    let left = align === "end" ? t.right - m.width : t.left;
    left = Math.min(Math.max(8, left), vw - m.width - 8);
    setPos({
      top,
      left,
      origin: `${align === "end" ? "right" : "left"} ${below ? "top" : "bottom"}`,
    });
  }, [open, align, items.length]);

  useEffect(() => {
    if (open && pos) itemRefs.current[active]?.focus();
  }, [open, pos, active]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    // Fixed coordinates go stale on scroll or resize; closing is the honest fix.
    function onScroll(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return;
      close(false);
    }
    function onResize() {
      close(false);
    }
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(true);
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const n = items.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + n) % n);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(n - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const start = (active + 1) % n;
      for (let step = 0; step < n; step++) {
        const i = (start + step) % n;
        if (items[i].text.toLowerCase().startsWith(k)) {
          setActive(i);
          break;
        }
      }
    }
  }

  function choose(key: string) {
    close(true);
    onSelect(key);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={triggerTitle}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {triggerContent}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              transformOrigin: pos?.origin,
              visibility: pos ? "visible" : "hidden",
            }}
            className={cn(
              "fixed z-[60] min-w-[11rem] rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl shadow-black/60 backdrop-blur-xl",
              pos && "animate-pop-in"
            )}
          >
            {items.map((item, i) => (
              <button
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={item.checked}
                tabIndex={i === active ? 0 : -1}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(item.key)}
                className={cn(
                  "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground/90 outline-none transition-colors md:h-9",
                  i === active && "bg-white/[0.08] text-foreground"
                )}
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                {item.checked && <Check className="h-4 w-4 text-foreground/70" aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
