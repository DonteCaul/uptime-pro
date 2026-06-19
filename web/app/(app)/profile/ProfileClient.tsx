"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ManageJumps } from "./ManageJumps";

type Tab = "profile" | "jumps";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "jumps", label: "Manage Jumps" },
];

export function ProfileClient({
  jumpCount,
  editForm,
}: {
  jumpCount: number;
  editForm: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Profile</h2>
      </div>

      {/* Tab bar — same segmented-control pattern as the jumps list page. */}
      <div className="flex bg-muted rounded-md p-1 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-1.5 rounded text-xs font-medium transition-colors text-center relative",
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "jumps" && jumpCount > 0 && (
              <span
                className={cn(
                  "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                  tab === t.id
                    ? "bg-primary/20 text-primary"
                    : "bg-foreground/10 text-muted-foreground",
                )}
              >
                {jumpCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "profile" ? editForm : <ManageJumps />}
    </div>
  );
}
