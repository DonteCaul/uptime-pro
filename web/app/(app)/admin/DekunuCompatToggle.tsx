"use client";

import { useTransition, useState } from "react";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { setDekunuCompat } from "@/lib/actions/admin";

export function DekunuCompatToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    if (!confirm(
      next
        ? "Enable Dekunu device sync? The /v1/* endpoints will start accepting device uploads."
        : "Disable Dekunu device sync? All /v1/* endpoints will return 404.",
    )) return;

    setEnabled(next);
    startTransition(async () => {
      try {
        await setDekunuCompat(next);
      } catch {
        setEnabled(!next); // revert on error
        alert("Failed to update Dekunu compat setting.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          Dekunu Device Sync
          {pending && (
            <Loader2 size={12} className="inline ml-1.5 animate-spin text-muted-foreground" />
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {enabled
            ? "Enabled — /v1/* endpoints accept device uploads"
            : "Disabled — /v1/* endpoints return 404"}
        </p>
      </div>
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={handleToggle}
      />
    </div>
  );
}
