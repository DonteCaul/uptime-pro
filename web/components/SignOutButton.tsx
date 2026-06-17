"use client";

import { signOut } from "@/lib/actions/auth";
import { LogOut } from "lucide-react";
import { useTransition } from "react";

/**
 * Client sign-out button. Calls the sign-out server action.
 */
export function SignOutButton({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => void signOut())}
      className={className}
    >
      <LogOut size={18} strokeWidth={1.75} />
      Logout
    </button>
  );
}
