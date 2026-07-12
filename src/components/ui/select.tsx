"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  labels: Record<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode) => void;
  itemValues: string[];
  highlightedValue: string | null;
  setHighlightedValue: (value: string | null) => void;
  listboxId: string;
}

const SelectContext = React.createContext<SelectContextValue | undefined>(undefined);

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

function Select({ value, defaultValue, onValueChange, children }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const [open, setOpen] = React.useState(false);
  const [labels, setLabels] = React.useState<Record<string, React.ReactNode>>({});
  const [itemValues, setItemValues] = React.useState<string[]>([]);
  const [highlightedValue, setHighlightedValue] = React.useState<string | null>(null);
  const listboxId = React.useId();

  const registerLabel = React.useCallback((itemValue: string, label: React.ReactNode) => {
    // Track registration order (effect order = document order) so keyboard
    // navigation can walk the options. An object's key order can't be used:
    // integer-like keys ("0", "1") get reordered.
    setItemValues((prev) => (prev.includes(itemValue) ? prev : [...prev, itemValue]));
    setLabels((prev) => {
      if (prev[itemValue] === label) return prev;
      // Avoid re-render loops for non-primitive labels whose identity changes each render
      if (itemValue in prev && typeof label === "object" && label !== null) return prev;
      return { ...prev, [itemValue]: label };
    });
  }, []);

  const actualValue = value !== undefined ? value : internalValue;
  const handleValueChange = (newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
    setOpen(false);
  };

  return (
    <SelectContext.Provider
      value={{
        value: actualValue,
        onValueChange: handleValueChange,
        open,
        setOpen,
        labels,
        registerLabel,
        itemValues,
        highlightedValue,
        setHighlightedValue,
        listboxId,
      }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

function SelectTrigger({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectTrigger must be used within Select");

  const { value, onValueChange, open, setOpen, itemValues, highlightedValue, setHighlightedValue, listboxId } = context;

  const openList = () => {
    setOpen(true);
    setHighlightedValue(value && itemValues.includes(value) ? value : itemValues[0] ?? null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (itemValues.length === 0) return;
      const currentIndex = highlightedValue ? itemValues.indexOf(highlightedValue) : -1;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? delta === 1
            ? 0
            : itemValues.length - 1
          : Math.min(Math.max(currentIndex + delta, 0), itemValues.length - 1);
      setHighlightedValue(itemValues[nextIndex]);
    } else if (e.key === "Enter" || e.key === " ") {
      // preventDefault also suppresses the button's synthetic click,
      // which would otherwise re-toggle the dropdown.
      e.preventDefault();
      if (!open) {
        openList();
      } else if (highlightedValue !== null) {
        onValueChange(highlightedValue);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <button
      type="button"
      id={id}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => (open ? setOpen(false) : openList())}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectValue must be used within Select");

  return <span>{context.labels[context.value] ?? (context.value || placeholder)}</span>;
}

function SelectContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectContent must be used within Select");

  if (!context.open) {
    // Keep items mounted (hidden) so they register their labels with the
    // context — otherwise SelectValue shows the raw value until first open.
    return <div hidden>{children}</div>;
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => context.setOpen(false)} />
      <div
        id={context.listboxId}
        role="listbox"
        className={cn(
          "absolute z-50 mt-1 max-h-60 min-w-[8rem] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

function SelectItem({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectItem must be used within Select");

  const { registerLabel } = context;
  React.useEffect(() => {
    registerLabel(value, children);
  }, [value, children, registerLabel]);

  const isSelected = context.value === value;
  const isHighlighted = context.highlightedValue === value;

  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (isHighlighted) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      onClick={() => context.onValueChange(value)}
      onMouseEnter={() => context.setHighlightedValue(value)}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        isHighlighted && "bg-accent text-accent-foreground",
        className
      )}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      {children}
    </div>
  );
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
