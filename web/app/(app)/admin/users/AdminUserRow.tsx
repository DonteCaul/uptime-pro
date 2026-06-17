"use client";

import { useTransition } from "react";
import { Shield, Globe, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  setUserRole,
  setUserPublic,
  deleteUser,
} from "@/lib/actions/admin";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  uptime_user_id: number | null;
  role: string | null;
  is_public: boolean;
  created_at: string;
}

export function AdminUserRow({ user }: { user: Profile }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">
            {user.full_name || "Unknown"}
          </p>
          {user.role === "admin" && (
            <Badge variant="default" className="gap-1">
              <Shield size={10} /> Admin
            </Badge>
          )}
          {user.is_public && (
            <Badge variant="secondary" className="gap-1">
              <Globe size={10} /> Public
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {user.email ?? "—"}
          {user.uptime_user_id ? ` · Dekunu #${user.uptime_user_id}` : ""}
          {" · joined "}
          {new Date(user.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Public toggle */}
        <div className="flex flex-col items-center gap-0.5">
          <Switch
            checked={user.is_public}
            disabled={pending}
            onCheckedChange={(v) => {
              startTransition(async () => {
                try {
                  await setUserPublic(user.id, v);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed");
                }
              });
            }}
          />
          <span className="text-[9px] text-muted-foreground">Public</span>
        </div>

        {/* Admin toggle */}
        <div className="flex flex-col items-center gap-0.5">
          <Switch
            checked={user.role === "admin"}
            disabled={pending}
            onCheckedChange={(v) => {
              startTransition(async () => {
                try {
                  await setUserRole(user.id, v ? "admin" : "user");
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed");
                }
              });
            }}
          />
          <span className="text-[9px] text-muted-foreground">Admin</span>
        </div>

        {/* Delete */}
        <button
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                `Delete ${user.full_name ?? user.email}? This removes all their jumps, telemetry, and logs.`,
              )
            )
              return;
            startTransition(async () => {
              try {
                await deleteUser(user.id);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
          className={cn(
            "p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
            pending && "opacity-50",
          )}
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
        </button>
      </div>
    </div>
  );
}
