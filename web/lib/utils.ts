import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with conflict resolution.
 * Ported from the original Vite app's frontend/src/lib/utils.js.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
