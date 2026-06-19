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

/** Max files uploaded concurrently to avoid hammering Postgres. */
const CONCURRENCY = 3;

interface LogResult {
  file: string;
  source: string;
  log_number: number | null;
}

interface UploadState {
  /** Indices of files currently being uploaded (empty when idle). */
  active: number[];
  /** Set of file indices that have finished uploading. */
  completed: Set<number>;
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
    active: [],
    completed: new Set<number>(),
    cancelled: false,
  });
  const [jumpResults, setJumpResults] = useState<IngestResult[]>([]);
  const [logResults, setLogResults] = useState<LogResult[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRefs = useRef<Map<number, AbortController>>(new Map());

  const uploading = uploadState.active.length > 0;
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
    // Abort all in-flight requests.
    abortRefs.current.forEach((ac) => ac.abort());
  }, []);

  async function handleUpload() {
    if (!files.length) return;
    setUploadState({ active: [], completed: new Set<number>(), cancelled: false });
    setJumpResults([]);
    setLogResults([]);
    setGlobalError(null);
    abortRefs.current.clear();

    const endpoint =
      tab === "jumps" ? "/api/jumps/upload" : "/api/logs/upload";

    // Result array — index-aligned with files[] so we can insert in order.
    const results: (IngestResult | LogResult | null)[] = new Array(files.length).fill(null);
    let nextIndex = 0;

    async function uploadFile(i: number) {
      // Check cancellation before starting this file.
      if (uploadState.cancelled) return;

      const ac = new AbortController();
      abortRefs.current.set(i, ac);

      setUploadState((s) => ({
        ...s,
        active: [...s.active, i],
      }));

      const formData = new FormData();
      formData.append("file", files[i]);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
          signal: ac.signal,
        });

        if (!res.ok && res.status === 499) {
          // Abort — skip.
          setUploadState((s) => ({
            ...s,
            active: s.active.filter((a) => a !== i),
            completed: new Set([...s.completed, i]),
          }));
          abortRefs.current.delete(i);
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);

        if (tab === "jumps") {
          const result = data.results?.[0] ?? {
            file: files[i].name,
            status: "error",
            error: "No result returned",
          };
          results[i] = result;
          // Append to jumpResults in file order — only emit results for
          // indices ≤ current completed max so we never show gaps.
          setJumpResults(
            results.filter((r): r is IngestResult => r != null && "status" in r && typeof (r as IngestResult).status === "string"),
          );
        } else {
          const result = data.results?.[0] ?? {
            file: files[i].name,
            source: "syslog",
            log_number: null,
          };
          results[i] = result;
          setLogResults(
            results.filter((r): r is LogResult => r != null && "source" in r),
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setUploadState((s) => ({ ...s, cancelled: true }));
        } else {
          const errorMsg =
            err instanceof Error ? err.message : "Upload failed";
          if (tab === "jumps") {
            results[i] = {
              file: files[i].name,
              status: "error",
              error: errorMsg,
            } as IngestResult;
            setJumpResults(
              results.filter((r): r is IngestResult => r != null && "status" in r && typeof (r as IngestResult).status === "string"),
            );
          } else {
            results[i] = {
              file: files[i].name,
              source: "error",
              log_number: null,
            } as LogResult;
            setLogResults(
              results.filter((r): r is LogResult => r != null && "source" in r),
            );
          }
        }
      } finally {
        setUploadState((s) => ({
          ...s,
          active: s.active.filter((a) => a !== i),
          completed: new Set([...s.completed, i]),
        }));
        abortRefs.current.delete(i);
      }
    }

    // Worker pool: runs up to CONCURRENCY uploads at a time.
    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY && w < files.length; w++) {
      workers.push(
        (async () => {
          while (nextIndex < files.length) {
            if (uploadState.cancelled) break;
            const idx = nextIndex++;
            await uploadFile(idx);
          }
        })(),
      );
    }

    await Promise.all(workers);

    setUploadState({ active: [], completed: new Set<number>(), cancelled: false });
    setFiles([]);
  }

  const jumpCreated = jumpResults.filter((r) => r.status === "created").length;
  const jumpDups = jumpResults.filter((r) => r.status === "duplicate").length;
  const jumpErrors = jumpResults.filter((r) => r.status === "error").length;
  const activeCount = uploadState.active.length;
  const completedCount = uploadState.completed.size;

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

      {/* Progress indicator — shows parallel status */}
      {uploading && (
        <Card>
          <CardContent className="pt-3 px-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={15} className="animate-spin text-primary" />
              <p className="text-foreground">
                {activeCount === 1
                  ? `Uploading ${completedCount + 1} of ${files.length}`
                  : `Uploading ${completedCount + activeCount} of ${files.length} (${activeCount} in parallel)`}
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
