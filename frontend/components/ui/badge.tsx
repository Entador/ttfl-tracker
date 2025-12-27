import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-linear-to-r from-primary to-primary/90 text-primary-foreground shadow-md hover:shadow-lg hover:scale-105",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground shadow-sm hover:shadow-md hover:bg-secondary/90",
        destructive:
          "border-transparent bg-linear-to-r from-destructive to-destructive/90 text-destructive-foreground shadow-md hover:shadow-lg hover:scale-105",
        outline: "text-foreground border-border hover:bg-accent",
        success:
          "border-transparent bg-linear-to-r from-green-500 to-green-600 text-white shadow-md hover:shadow-lg hover:scale-105",
        warning:
          "border-transparent bg-linear-to-r from-amber-500 to-amber-600 text-white shadow-md hover:shadow-lg hover:scale-105",
        elite:
          "border-transparent bg-linear-to-r from-purple-600 to-purple-700 text-white shadow-md hover:shadow-lg hover:scale-105",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
