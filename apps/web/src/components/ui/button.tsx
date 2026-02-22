import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-normal ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-secondary text-lg font-normal  text-white",
        destructive:
          "bg-white border border-secondary text-secondary hover:bg-primary",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "text-white  text-sm font-normal  bg-gradient-to-r from-[#FF0077] to-[#D60565]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 underline",
        borderbottom:
          "text-secondary border-b-2 pb-3 border-secondary text-sx font-normal ",
        underline:
          "text-secondary underline text-base font-normal ",
          tertiary:"bg-tertiary text-lg font-normal  text-white"
      },
      size: {
        default: "h-14 px-9 py-2 rounded-md",
        rounded: "h-14 px-9 py-2 rounded-full",
        sm: "h-9 rounded-md px-8",
        lg: "h-11 rounded-md px-8",
        md: "h-12 rounded-md px-8",
        icon: "h-10 w-10",
        border: "rounded-none",
        width:"px-0 mx-0"
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
