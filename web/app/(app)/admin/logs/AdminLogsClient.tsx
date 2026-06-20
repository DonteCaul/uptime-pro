"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilterOption {
  value: number | string;
  label: string;
}

export function AdminLogsClient({
  devices,
  users,
  currentDevice,
  currentUser,
}: {
  devices: FilterOption[];
  users: FilterOption[];
  currentDevice: number | null;
  currentUser: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const applyFilters = useCallback(
    (device: number | null, user: string | null) => {
      const parts: string[] = [];
      if (device != null) parts.push(`device=${device}`);
      if (user) parts.push(`user=${user}`);
      const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
      router.replace(`/admin/logs${qs}`, { scroll: false });
    },
    [router],
  );

  const clearFilters = useCallback(() => {
    router.replace("/admin/logs", { scroll: false });
  }, [router]);

  const hasFilters = currentDevice != null || currentUser != null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Device filter */}
      <select
        value={currentDevice ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          applyFilters(val ? parseInt(val, 10) : null, currentUser);
        }}
        className="text-xs bg-muted border-0 rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">All devices</option>
        {devices.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      {/* User filter */}
      <select
        value={currentUser ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          applyFilters(currentDevice, val || null);
        }}
        className="text-xs bg-muted border-0 rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">All users</option>
        {users.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-xs h-7 px-2"
        >
          <X size={12} className="mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
