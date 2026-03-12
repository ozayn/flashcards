"use client";

import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const baseStyles =
  "inline-flex shrink-0 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4";

const variantStyles = {
  default:
    "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200",
  outline:
    "border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800",
  secondary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
  ghost:
    "hover:bg-neutral-100 dark:hover:bg-neutral-800",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800",
  link:
    "text-blue-600 underline-offset-4 hover:underline dark:text-blue-400",
};

const sizeStyles = {
  default: "gap-1.5",
  sm: "h-8 px-2.5 text-xs",
  lg: "h-10 px-4",
  icon: "size-9 p-0",
  "icon-sm": "size-8 p-0",
  "icon-lg": "size-10 p-0",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "default", size = "default", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);

export { Button };
