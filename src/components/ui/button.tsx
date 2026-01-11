import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-white text-black shadow-lg shadow-white/10 hover:bg-white/90 hover:shadow-white/20",
        destructive:
          "bg-destructive text-destructive-foreground shadow-lg shadow-red-500/20 hover:bg-destructive/90",
        outline:
          "border border-white/10 bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/20",
        secondary:
          "bg-white/[0.06] text-white backdrop-blur-sm hover:bg-white/[0.1]",
        ghost: "hover:bg-white/[0.06]",
        link: "text-white/80 underline-offset-4 hover:underline hover:text-white",
        glass:
          "bg-white/[0.05] backdrop-blur-xl border border-white/10 hover:bg-white/[0.1] hover:border-white/20 shadow-lg shadow-black/20",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
