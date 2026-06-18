"use client";

import { useState, useRef, useCallback } from "react";
import {
  CheckCircle,
  AlertCircle,
  MinusCircle,
  X,
  Upload as UploadIcon,
  Loader2,
  StopCircle,
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

interface UploadState {
  /** Index of the file currently being uploaded (-1 when idle). */
  current: number;
  /** Whether the user has requested cancellation. */
  cancelled: boolean;
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
  const [uploadState, setUploadState] = useState<UploadState>({
    current: -1,
    cancelled: false,
  });
  const [jumpResults, setJumpResults] = useState<IngestResult[]>([]);
  const [logResults, setLogResults] = useState<LogResult[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const uploading = uploadState.current >= 0;
  const ext = tab === "jumps" ? ".csv" : ".txt";

  function switchTab(next: Tab) {
    if (uploading) return;
    setTab(next);
    setFiles([]);
    setJumpResults([]);
    setLogResults([]);
    setGlobalError(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(ext),
    );
    setFiles((prev) => [...prev, ...dropped]);
    setJumpResults([]);
    setLogResults([]);
    setGlobalError(null);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (uploading) return;
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    setJumpResults([]);
    setLogResults([]);
    setGlobalError(null);
  }

  const handleCancel = useCallback(() => {
    setUploadState((s) => ({ ...s, cancelled: true }));
    abortRef.current?.abort();
  }, []);

  async function handleUpload() {
    if (!files.length) return;
    setUploadState({ current: 0, cancelled: false });
    setJumpResults([]);
    setLogResults([]);
    setGlobalError(null);

    const endpoint =
      tab === "jumps" ? "/api/jumps/upload" : "/api/logs/upload";
    const results: IngestResult[] | LogResult[] = [];

    for (let i = 0; i < files.length; i++) {
      // Check cancellation before each file.
      if (uploadState.cancelled) break;

      setUploadState((s) => ({ ...s, current: i }));

      const formData = new FormData();
      formData.append("file", files[i]);

      abortRef.current = new AbortController();

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        });

        // Abort means user cancelled — stop the loop.
        if (!res.ok && res.status === 499) break;

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);

        if (tab === "jumps") {
          const result = data.results?.[0] ?? {
            file: files[i].name,
            status: "error",
            error: "No result returned",
          };
          (results as IngestResult[]).push(result);
          setJumpResults([...(results as IngestResult[])]);
        } else {
          const result = data.results?.[0] ?? {
            file: files[i].name,
            source: "syslog",
            log_number: null,
          };
          (results as LogResult[]).push(result);
          setLogResults([...(results as LogResult[])]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled — stop cleanly.
          setUploadState((s) => ({ ...s, cancelled: true }));
          break;
        }

        // Per-file error — record it but continue with remaining files.
        const errorMsg =
          err instanceof Error ? err.message : "Upload failed";
        if (tab === "jumps") {
          (results as IngestResult[]).push({
            file: files[i].name,
            status: "error",
            error: errorMsg,
          });
          setJumpResults([...(results as IngestResult[])]);
        } else {
          (results as LogResult[]).push({
            file: files[i].name,
            source: "error",
            log_number: null,
          });
          setLogResults([...(results as LogResult[])]);
        }
      }
    }

    setUploadState({ current: -1, cancelled: false });
    setFiles([]);
  }

  const currentFileName =
    uploadState.current >= 0 && uploadState.current < files.length
      ? files[uploadState.current].name
      : null;

  const jumpCreated = jumpResults.filter((r) => r.status === "created").length;
  const jumpDups = jumpResults.filter((r) => r.status === "duplicate").length;
  const jumpErrors = jumpResults.filter((r) => r.status === "error").length;

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

      {/* Drop zone — hidden during upload */}
      {!uploading && (
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
          <UploadIcon
            size={28}
            className="mx-auto mb-3 text-muted-foreground"
          />
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
      )}

      {/* Selected files — shown before upload starts */}
      {files.length > 0 && !uploading && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </p>
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
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

      {/* Upload / Cancel button */}
      {!uploading && files.length > 0 && (
        <Button onClick={handleUpload} className="w-full">
          Upload {files.length} file{files.length !== 1 ? "s" : ""}
        </Button>
      )}

      {uploading && (
        <Button onClick={handleCancel} variant="outline" className="w-full">
          <StopCircle size={16} className="mr-2" />
          Cancel Upload
        </Button>
      )}

      {/* Progress indicator */}
      {uploading && currentFileName && (
        <Card>
          <CardContent className="pt-3 px-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={15} className="animate-spin text-primary" />
              <p className="text-foreground">
                Uploading {uploadState.current + 1} of {files.length}{" "}
                <span className="text-muted-foreground">— {currentFileName}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global error (non-per-file) */}
      {globalError && (
        <Card>
          <CardContent className="pt-3">
            <p className="text-sm text-destructive">{globalError}</p>
          </CardContent>
        </Card>
      )}

      {/* Jump results — live as they complete */}
      {jumpResults.length > 0 && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {jumpCreated} new · {jumpDups} duplicate
              {jumpErrors > 0 && ` · ${jumpErrors} failed`}
              {uploading && " · uploading…"}
            </p>
            {jumpResults.map((r, i) => (
              <JumpResultItem key={`${r.file}-${i}`} r={r} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Log results — live as they complete */}
      {logResults.length > 0 && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {logResults.length} uploaded
              {uploading && " · uploading…"}
            </p>
            {logResults.map((r, i) => (
              <LogResultItem key={`${r.file}-${i}`} r={r} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
