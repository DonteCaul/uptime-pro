"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trash2, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { alt, speed, type UnitSystem } from "@/lib/units";
import { fmtDuration } from "@/lib/format";
import { encodeJumpId } from "@/lib/slug";
import { useUnits } from "@/lib/useUnits";

interface JumpRow {
  id: number;
  filename: string;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
  max_freefall_speed_ms: number | null;
}

/** Styled checkbox using native input — avoids adding a radix dependency. */
function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean | "indeterminate";
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === true ? "true" : checked === "indeterminate" ? "mixed" : "false"}
      aria-label={label}
      onClick={onChange}
      className="peer h-4 w-4 shrink-0 rounded-sm border border-primary/30 bg-card ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
    >
      {(checked === true || checked === "indeterminate") && (
        <svg
          viewBox="0 0 12 12"
          fill="none"
          className="w-3 h-3 text-primary"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {checked === "indeterminate" ? (
            <line x1="2" y1="6" x2="10" y2="6" />
          ) : (
            <path d="M2.5 6l2.5 2.5 5-5" />
          )}
        </svg>
      )}
    </button>
  );
}

export function ManageJumps() {
  const [jumps, setJumps] = useState<JumpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);

  const fetchJumps = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("jumps")
      .select("id, filename, jumped_at, exit_altitude_m, freefall_duration_s, max_freefall_speed_ms")
      .eq("user_id", user.id)
      .order("jumped_at", { ascending: false, nullsFirst: false })
      .range(0, 999);

    setJumps((data as JumpRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchJumps();
  }, [fetchJumps]);

  const allSelected = jumps.length > 0 && selected.size === jumps.length;
  const noneSelected = selected.size === 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jumps.map((j) => j.id)));
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} jump${selected.size > 1 ? "s" : ""}? This will permanently remove the jump data and all sensor telemetry. This cannot be undone.`)) return;

    setDeleting(true);
    setDeletedCount(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const ids = Array.from(selected);
      const { error } = await supabase
        .from("jumps")
        .delete()
        .in("id", ids);

      if (error) {
        alert(`Delete failed: ${error.message}`);
        setDeleting(false);
        return;
      }

      setDeletedCount(selected.size);
      setJumps((prev) => prev.filter((j) => !selected.has(j.id)));
      setSelected(new Set());
    } catch {
      alert("Delete failed. Please try again.");
    } finally {
      setDeleting(false);
      // Clear success message after 3 seconds.
      setTimeout(() => setDeletedCount(null), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jumps.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        No jumps yet.{" "}
        <Link href="/upload" className="text-primary hover:underline">
          Upload logs
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bulk action bar */}
      <div className="flex items-center justify-between px-1">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <Checkbox
            checked={allSelected ? true : noneSelected ? false : "indeterminate"}
            onChange={toggleAll}
          />
          {selected.size > 0
            ? `${selected.size} of ${jumps.length} selected`
            : `Select all (${jumps.length})`}
        </label>

        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={handleDelete}
          >
            {deleting ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 size={14} className="mr-1" />
                Delete {selected.size}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Success toast */}
      {deletedCount != null && (
        <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary font-medium">
          <Check size={14} />
          Deleted {deletedCount} jump{deletedCount !== 1 ? "s" : ""}
        </div>
      )}

      {/* Jump list */}
      <Card>
        <CardContent className="p-0">
          {jumps.map((jump, i) => (
            <JumpRowWithCheckbox
              key={jump.id}
              jump={jump}
              checked={selected.has(jump.id)}
              onToggle={() => toggleOne(jump.id)}
              isFirst={i === 0}
              isLast={i === jumps.length - 1}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function JumpRowWithCheckbox({
  jump,
  checked,
  onToggle,
  isFirst,
  isLast,
}: {
  jump: JumpRow;
  checked: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const units = useUnits("metric");

  return (
    <div
      className={`flex items-center px-3 py-3 border-b border-border ${
        isLast ? "border-0" : ""
      } hover:bg-accent/30 transition-colors ${
        isFirst ? "first:rounded-t-lg" : ""
      } ${isLast ? "last:rounded-b-lg" : ""}`}
    >
      {/* Checkbox — separate hit target so clicking the row doesn't toggle */}
      <div
        className="shrink-0 mr-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={checked}
          onChange={onToggle}
          label={`Select jump ${jump.filename}`}
        />
      </div>

      {/* Jump info — clickable link to detail */}
      <Link
        href={`/jumps/${encodeJumpId(jump.id)}`}
        className="flex-1 flex items-center justify-between min-w-0"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {jump.jumped_at
              ? new Date(jump.jumped_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : (jump.filename?.replace(".csv", "") || "Unknown")}
          </p>
          <div className="flex gap-2 mt-0.5 flex-wrap">
            {jump.exit_altitude_m != null && (
              <span className="text-xs text-muted-foreground">
                ↑ {alt(jump.exit_altitude_m, units)}
              </span>
            )}
            {jump.freefall_duration_s != null && (
              <span className="text-xs text-muted-foreground">
                FF {fmtDuration(jump.freefall_duration_s)}
              </span>
            )}
            {jump.max_freefall_speed_ms != null && (
              <span className="text-xs text-primary">
                {speed(jump.max_freefall_speed_ms, units)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
