import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ui-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-lg shadow-primary/10 hover:bg-primary/90 hover:shadow-primary/20",
        destructive:
          "bg-destructive text-destructive-foreground shadow-lg shadow-red-500/20 hover:bg-destructive/90",
        outline:
          "ui-btn-outline border hover:bg-foreground/[0.08] hover:border-foreground/20",
        secondary:
          "bg-foreground/[0.06] text-foreground backdrop-blur-sm hover:bg-foreground/[0.1]",
        ghost: "hover:bg-foreground/[0.06]",
        link: "text-foreground/80 underline-offset-4 hover:underline hover:text-foreground",
        glass:
          "ui-btn-glass border hover:bg-foreground/[0.1] hover:border-foreground/20",
      },
      size: {
        default: "h-11 md:h-10 px-5 py-2",
        sm: "h-9 md:h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-11 w-11 md:h-10 md:w-10",
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
