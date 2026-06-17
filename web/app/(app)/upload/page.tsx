"use client";

import { useState, useRef } from "react";
import {
  CheckCircle,
  AlertCircle,
  MinusCircle,
  X,
  Upload as UploadIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IngestResult } from "@/lib/dekunu/ingest";

type Tab = "jumps" | "logs";

interface LogResult {
  file: string;
  source: string;
  log_number: number | null;
}

function JumpResultItem({ r }: { r: IngestResult }) {
  const isOk = r.status === "created";
  const isDup = r.status === "duplicate";
  const Icon = isOk ? CheckCircle : isDup ? MinusCircle : AlertCircle;
  const color = isOk
    ? "text-primary"
    : isDup
      ? "text-yellow-500"
      : "text-destructive";
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-border last:border-0 text-sm">
      <Icon size={15} className={cn("shrink-0 mt-0.5", color)} />
      <div className="min-w-0">
        <p className="text-foreground truncate">{r.file}</p>
        {isOk && r.meta?.exit_altitude_m && (
          <p className="text-xs text-muted-foreground">
            Exit {Math.round(r.meta.exit_altitude_m)}m
            {r.meta.freefall_duration_s
              ? ` · ${Math.round(r.meta.freefall_duration_s)}s FF`
              : ""}
          </p>
        )}
        {isDup && <p className="text-xs text-yellow-600">Already uploaded</p>}
        {r.error && <p className="text-xs text-destructive">{r.error}</p>}
      </div>
    </div>
  );
}

function LogResultItem({ r }: { r: LogResult }) {
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-border last:border-0 text-sm">
      <CheckCircle size={15} className="shrink-0 mt-0.5 text-primary" />
      <div className="min-w-0">
        <p className="text-foreground truncate">{r.file}</p>
        <p className="text-xs text-muted-foreground">
          {r.source}
          {r.log_number != null ? ` #${r.log_number}` : ""}
        </p>
      </div>
    </div>
  );
}

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>("jumps");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jumpResults, setJumpResults] = useState<IngestResult[] | null>(null);
  const [logResults, setLogResults] = useState<LogResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ext = tab === "jumps" ? ".csv" : ".txt";

  function switchTab(next: Tab) {
    setTab(next);
    setFiles([]);
    setJumpResults(null);
    setLogResults(null);
    setError(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(ext),
    );
    setFiles((prev) => [...prev, ...dropped]);
    setJumpResults(null);
    setLogResults(null);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    setJumpResults(null);
    setLogResults(null);
  }

  async function handleUpload() {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    setJumpResults(null);
    setLogResults(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files[]", file);
      }
      const endpoint =
        tab === "jumps" ? "/api/jumps/upload" : "/api/logs/upload";
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      if (tab === "jumps") {
        setJumpResults(data.results ?? []);
      } else {
        setLogResults(data.results ?? []);
      }
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <h2 className="text-xl font-bold text-foreground">Upload</h2>

      {/* Tab toggle */}
      <div className="flex bg-muted rounded-md p-1 gap-1">
        {(["jumps", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={cn(
              "flex-1 py-1.5 rounded text-sm font-medium transition-colors",
              tab === t
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "jumps" ? "Jump Logs" : "System Logs"}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground",
        )}
      >
        <UploadIcon size={28} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-foreground font-medium text-sm">
          Drop {tab === "jumps" ? "CSV" : "TXT"} files here
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {tab === "jumps"
            ? "Dekunu action_*.csv format"
            : "syslog.N.txt or syslog_esp32.N.txt"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ext}
          multiple
          className="hidden"
          onChange={onPick}
        />
      </div>

      {/* Selected files */}
      {files.length > 0 && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </p>
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <span className="text-sm text-foreground truncate">
                  {f.name}
                </span>
                <button
                  onClick={() =>
                    setFiles((p) => p.filter((_, idx) => idx !== i))
                  }
                  className="text-muted-foreground hover:text-destructive ml-3 shrink-0 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        onClick={handleUpload}
        disabled={!files.length || uploading}
        className="w-full"
      >
        {uploading
          ? "Uploading…"
          : `Upload ${files.length || ""} file${files.length !== 1 ? "s" : ""}`}
      </Button>

      {error && (
        <Card>
          <CardContent className="pt-3">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Jump results */}
      {jumpResults && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {jumpResults.filter((r) => r.status === "created").length} new ·{" "}
              {jumpResults.filter((r) => r.status === "duplicate").length}{" "}
              duplicate
            </p>
            {jumpResults.map((r, i) => (
              <JumpResultItem key={i} r={r} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Log results */}
      {logResults && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {logResults.length} uploaded
            </p>
            {logResults.map((r, i) => (
              <LogResultItem key={i} r={r} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
