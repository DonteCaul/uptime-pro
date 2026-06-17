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

function ResultItem({ r }: { r: IngestResult }) {
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

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<IngestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(".csv"),
    );
    setFiles((prev) => [...prev, ...dropped]);
    setResults(null);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    setResults(null);
  }

  async function handleUpload() {
    if (!files.length) return;
    setUploading(true);
    setResults(null);
    setError(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files[]", file);
      }
      const res = await fetch("/api/jumps/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }
      setResults(data.results ?? []);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <h2 className="text-xl font-bold text-foreground">Upload Jump Logs</h2>

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
          Drop CSV files here
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          or tap to browse · Dekunu action_*.csv format
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={onPick}
        />
      </div>

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

      {results && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {results.filter((r) => r.status === "created").length} new ·{" "}
              {results.filter((r) => r.status === "duplicate").length} duplicate
            </p>
            {results.map((r, i) => (
              <ResultItem key={i} r={r} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
