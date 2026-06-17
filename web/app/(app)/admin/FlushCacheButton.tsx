"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flushCache } from "@/lib/actions/admin";

export function FlushCacheButton({
  table,
}: {
  table: "places_cache" | "geocode_cache" | "weather_cache";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Flush all entries from ${table}?`)) return;
        startTransition(async () => {
          try {
            await flushCache(table);
          } catch (err) {
            alert(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Trash2 size={14} />
      )}
      Flush
    </Button>
  );
}
