import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-blue-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100",
          "dark:focus:ring-blue-400",
          className
        )}
        {...props}
      />
    );
  }
);

export { Input };
