"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import posthog from "posthog-js";
import {
  CheckCircle,
  AlertCircle,
  MinusCircle,
  X,
  Upload as UploadIcon,
  Loader2,
  StopCircle,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IngestResult } from "@/lib/dekunu/ingest";

/** Max files uploaded concurrently to avoid hammering Postgres. */
const CONCURRENCY = 3;

/** Dekunu upload mode — all upload paths are Dekunu-specific. */
type DekunuMode = "jumps" | "summaries" | "logs";

interface LogResult {
  file: string;
  source: string;
  log_number: number | null;
}

interface SummaryUpdateResult {
  csv: string;
  status: "updated" | "error";
  jump_id?: number;
  error?: string;
}

interface FilePair {
  csv: File;
  summary?: File;
}

interface UploadState {
  /** Indices of pairs currently being uploaded (empty when idle). */
  active: number[];
  /** Set of pair indices that have finished uploading. */
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
    <div className="border-border flex items-start gap-2 border-b py-2.5 text-sm last:border-0">
      <Icon size={15} className={cn("mt-0.5 shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-foreground truncate">{r.file}</p>
        {isOk && r.meta?.exit_altitude_m && (
          <p className="text-muted-foreground text-xs">
            Exit {Math.round(r.meta.exit_altitude_m)}m
            {r.meta.freefall_duration_s
              ? ` · ${Math.round(r.meta.freefall_duration_s)}s FF`
              : ""}
          </p>
        )}
        {isDup && <p className="text-xs text-yellow-600">Already uploaded</p>}
        {r.error && <p className="text-destructive text-xs">{r.error}</p>}
      </div>
    </div>
  );
}

function LogResultItem({ r }: { r: LogResult }) {
  return (
    <div className="border-border flex items-start gap-2 border-b py-2.5 text-sm last:border-0">
      <CheckCircle size={15} className="text-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-foreground truncate">{r.file}</p>
        <p className="text-muted-foreground text-xs">
          {r.source}
          {r.log_number != null ? ` #${r.log_number}` : ""}
        </p>
      </div>
    </div>
  );
}

/**
 * Pair CSV files with their matching summary JSONs.
 * Summary naming: `s_<csvFilename without .csv>.json`
 */
function pairFiles(files: File[]): FilePair[] {
  const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
  const jsons = new Map(
    files
      .filter((f) => f.name.toLowerCase().endsWith(".json"))
      .map((f) => [f.name, f]),
  );

  return csvs.map((csv) => {
    const summaryName = `s_${csv.name.replace(/\.csv$/i, ".json")}`;
    const summary =
      jsons.get(summaryName) ?? jsons.get(summaryName.toLowerCase());
    return { csv, summary };
  });
}

const DEKUNU_MODE_OPTIONS: {
  value: DekunuMode;
  label: string;
  description: string;
}[] = [
  { value: "jumps", label: "Jump Logs", description: "CSV + JSON pairs" },
  { value: "summaries", label: "Update Jumps", description: "JSON only" },
  { value: "logs", label: "System Logs", description: "TXT files" },
];

export default function UploadPage() {
  const [mode, setMode] = useState<DekunuMode>("jumps");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    active: [],
    completed: new Set<number>(),
    cancelled: false,
  });
  const [jumpResults, setJumpResults] = useState<IngestResult[]>([]);
  const [logResults, setLogResults] = useState<LogResult[]>([]);
  const [summaryResults, setSummaryResults] = useState<SummaryUpdateResult[]>(
    [],
  );
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRefs = useRef<Map<number, AbortController>>(new Map());
  const cancelledRef = useRef(false);

  const uploading = uploadState.active.length > 0;

  const ext =
    mode === "jumps" ? ".csv,.json" : mode === "logs" ? ".txt" : ".json";

  // Build file pairs for validation and display (jump logs only).
  const pairs = useMemo(() => {
    if (mode !== "jumps") return null;
    return pairFiles(files);
  }, [files, mode]);

  // Check for CSVs missing their summary JSON (jump logs only).
  const missingSummaries = useMemo(() => {
    if (!pairs) return [];
    return pairs.filter((p) => !p.summary).map((p) => p.csv.name);
  }, [pairs]);

  function switchMode(next: DekunuMode) {
    if (uploading) return;
    setMode(next);
    setFiles([]);
    setJumpResults([]);
    setLogResults([]);
    setSummaryResults([]);
    setGlobalError(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;

    const accepted = Array.from(e.dataTransfer.files).filter((f) => {
      const lower = f.name.toLowerCase();
      if (mode === "logs") return lower.endsWith(".txt");
      if (mode === "summaries") return lower.endsWith(".json");
      return lower.endsWith(".csv") || lower.endsWith(".json");
    });

    setFiles((prev) => [...prev, ...accepted]);
    setJumpResults([]);
    setLogResults([]);
    setSummaryResults([]);
    setGlobalError(null);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (uploading) return;
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    setJumpResults([]);
    setLogResults([]);
    setSummaryResults([]);
    setGlobalError(null);
  }

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    posthog.capture("upload_cancelled", { mode });
    setUploadState((s) => ({ ...s, cancelled: true }));
    abortRefs.current.forEach((ac) => ac.abort());
  }, [mode]);

  async function handleUpload() {
    if (!files.length) return;

    // For jump logs: reject if any CSV is missing its summary JSON.
    if (mode === "jumps" && missingSummaries.length > 0) {
      setGlobalError(
        `Missing summary JSON for: ${missingSummaries.join(", ")}. Each CSV must have a matching s_*.json file.`,
      );
      return;
    }

    cancelledRef.current = false;
    setUploadState({
      active: [],
      completed: new Set<number>(),
      cancelled: false,
    });
    setJumpResults([]);
    setLogResults([]);
    setSummaryResults([]);
    setGlobalError(null);
    abortRefs.current.clear();

    if (mode === "logs") {
      await uploadSystemLogs();
    } else if (mode === "summaries") {
      await uploadSummaries();
    } else {
      await uploadDekunuPairs();
    }

    if (!cancelledRef.current) {
      if (mode === "jumps") {
        posthog.capture("jump_files_uploaded", {
          files_count: uploadItemCount,
        });
      } else if (mode === "logs") {
        posthog.capture("system_logs_uploaded", {
          files_count: uploadItemCount,
        });
      } else if (mode === "summaries") {
        posthog.capture("jump_summaries_updated", {
          files_count: uploadItemCount,
        });
      }
    }

    setUploadState({
      active: [],
      completed: new Set<number>(),
      cancelled: false,
    });
    setFiles([]);
  }

  async function uploadDekunuPairs() {
    const p = pairs!;
    const endpoint = "/api/jumps/upload";
    const results: (IngestResult | null)[] = new Array(p.length).fill(null);
    let nextIndex = 0;

    async function uploadPair(i: number) {
      if (uploadState.cancelled) return;
      const ac = new AbortController();
      abortRefs.current.set(i, ac);

      setUploadState((s) => ({ ...s, active: [...s.active, i] }));

      const formData = new FormData();
      formData.append("file", p[i].csv);
      if (p[i].summary) formData.append("summary", p[i].summary);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
          signal: ac.signal,
        });

        if (!res.ok && res.status === 499) {
          setUploadState((s) => ({
            ...s,
            active: s.active.filter((a) => a !== i),
            completed: new Set([...s.completed, i]),
          }));
          abortRefs.current.delete(i);
          return;
        }

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error ?? `Upload failed (${res.status})`);

        const result = data.results?.[0] ?? {
          file: p[i].csv.name,
          status: "error",
          error: "No result returned",
        };
        results[i] = result;
        setJumpResults(
          results.filter(
            (r): r is IngestResult =>
              r != null &&
              "status" in r &&
              typeof (r as IngestResult).status === "string",
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setUploadState((s) => ({ ...s, cancelled: true }));
        } else {
          const errorMsg = err instanceof Error ? err.message : "Upload failed";
          results[i] = {
            file: p[i].csv.name,
            status: "error",
            error: errorMsg,
          } as IngestResult;
          setJumpResults(
            results.filter(
              (r): r is IngestResult =>
                r != null &&
                "status" in r &&
                typeof (r as IngestResult).status === "string",
            ),
          );
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

    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY && w < p.length; w++) {
      workers.push(
        (async () => {
          while (nextIndex < p.length) {
            if (uploadState.cancelled) break;
            const idx = nextIndex++;
            await uploadPair(idx);
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  async function uploadSummaries() {
    const jsons = files.filter((f) => f.name.toLowerCase().endsWith(".json"));
    const endpoint = "/api/jumps/update-summary";
    const results: (SummaryUpdateResult | null)[] = new Array(
      jsons.length,
    ).fill(null);
    let nextIndex = 0;

    async function uploadFile(i: number) {
      if (uploadState.cancelled) return;
      const ac = new AbortController();
      abortRefs.current.set(i, ac);

      setUploadState((s) => ({ ...s, active: [...s.active, i] }));

      const formData = new FormData();
      formData.append("file", jsons[i]);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
          signal: ac.signal,
        });

        const data = await res.json();
        const result: SummaryUpdateResult = data.results?.[0] ?? {
          csv: jsons[i].name,
          status: "error",
          error: "No result returned",
        };
        results[i] = result;
        setSummaryResults(
          results.filter((r): r is SummaryUpdateResult => r != null),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setUploadState((s) => ({ ...s, cancelled: true }));
        } else {
          results[i] = {
            csv: jsons[i].name,
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          };
          setSummaryResults(
            results.filter((r): r is SummaryUpdateResult => r != null),
          );
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

    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY && w < jsons.length; w++) {
      workers.push(
        (async () => {
          while (nextIndex < jsons.length) {
            if (uploadState.cancelled) break;
            const idx = nextIndex++;
            await uploadFile(idx);
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  async function uploadSystemLogs() {
    const txts = files.filter((f) => f.name.toLowerCase().endsWith(".txt"));
    const endpoint = "/api/logs/upload";
    const results: (LogResult | null)[] = new Array(txts.length).fill(null);
    let nextIndex = 0;

    async function uploadFile(i: number) {
      if (uploadState.cancelled) return;
      const ac = new AbortController();
      abortRefs.current.set(i, ac);

      setUploadState((s) => ({ ...s, active: [...s.active, i] }));

      const formData = new FormData();
      formData.append("file", txts[i]);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
          signal: ac.signal,
        });

        if (!res.ok && res.status === 499) {
          setUploadState((s) => ({
            ...s,
            active: s.active.filter((a) => a !== i),
            completed: new Set([...s.completed, i]),
          }));
          abortRefs.current.delete(i);
          return;
        }

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error ?? `Upload failed (${res.status})`);

        const result = data.results?.[0] ?? {
          file: txts[i].name,
          source: "syslog",
          log_number: null,
        };
        results[i] = result;
        setLogResults(
          results.filter((r): r is LogResult => r != null && "source" in r),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setUploadState((s) => ({ ...s, cancelled: true }));
        } else {
          results[i] = {
            file: txts[i].name,
            source: "error",
            log_number: null,
          } as LogResult;
          setLogResults(
            results.filter((r): r is LogResult => r != null && "source" in r),
          );
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

    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY && w < txts.length; w++) {
      workers.push(
        (async () => {
          while (nextIndex < txts.length) {
            if (uploadState.cancelled) break;
            const idx = nextIndex++;
            await uploadFile(idx);
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  const activeCount = uploadState.active.length;
  const completedCount = uploadState.completed.size;

  // Count display items.
  const uploadItemCount =
    mode === "logs"
      ? files.filter((f) => f.name.toLowerCase().endsWith(".txt")).length
      : mode === "summaries"
        ? files.filter((f) => f.name.toLowerCase().endsWith(".json")).length
        : (pairs?.length ?? 0);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <h2 className="text-foreground text-xl font-bold">Upload</h2>

      {/* Dekunu mode selector */}
      {!uploading && (
        <div className="relative">
          <select
            value={mode}
            onChange={(e) => switchMode(e.target.value as DekunuMode)}
            className="border-border bg-input text-foreground focus:ring-ring w-full appearance-none rounded-md border px-3 py-2 pr-8 text-sm focus:ring-1 focus:outline-none"
          >
            {DEKUNU_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Dekunu — {opt.label} ({opt.description})
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
          />
        </div>
      )}

      {/* Mode description */}
      <Card className="bg-muted/40">
        <CardContent className="text-muted-foreground space-y-2 px-4 pt-3 pb-3 text-xs leading-relaxed">
          {mode === "jumps" && (
            <>
              <p>
                <strong className="text-foreground">Getting your files:</strong>{" "}
                Connect your Dekunu to your computer via USB. In the device's
                USB settings, enable{" "}
                <strong className="text-foreground">
                  Mass Storage / USB File Transfer mode
                </strong>
                . The Dekunu will mount as a removable drive. CSV files live in
                the{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  action/
                </code>{" "}
                folder and JSON files live in the{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  summaries/
                </code>{" "}
                folder. You'll see pairs like:
              </p>
              <ul className="list-inside list-disc space-y-1 pl-1">
                <li>
                  <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                    action/
                  </code>{" "}
                  →{" "}
                  <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                    action_469_20190112_1910-240.csv
                  </code>{" "}
                  — raw sensor data
                </li>
                <li>
                  <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                    summaries/
                  </code>{" "}
                  →{" "}
                  <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                    s_action_469_20190112_1910-240.json
                  </code>{" "}
                  — summary with altitudes, discipline, GPS, etc.
                </li>
              </ul>
              <p>
                <strong className="text-foreground">To upload:</strong> Select
                both the CSV and its matching JSON for each jump. The JSON
                provides accurate metadata while the CSV contains the full
                telemetry track. Both must be present.
              </p>
            </>
          )}
          {mode === "summaries" && (
            <>
              <p>
                <strong className="text-foreground">Getting your files:</strong>{" "}
                Same USB extraction — the{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  s_action_*.json
                </code>{" "}
                files live in the{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  summaries/
                </code>{" "}
                folder on the Dekunu drive.
              </p>
              <p>
                <strong className="text-foreground">To upload:</strong> Select
                only the JSON summary files. This mode updates existing jumps
                that were already uploaded (e.g. missing metadata like
                discipline or GPS coordinates) without re-uploading the full
                sensor data. The system matches each JSON to its jump by
                filename.
              </p>
            </>
          )}
          {mode === "logs" && (
            <>
              <p>
                <strong className="text-foreground">Getting your files:</strong>{" "}
                Via USB in Mass Storage mode, look in the{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  sysLogs/
                </code>{" "}
                folder on the Dekunu drive. Files are named like{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  syslog.N.txt
                </code>{" "}
                or{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  syslog_esp32.N.txt
                </code>
                .
              </p>
              <p>
                <strong className="text-foreground">To upload:</strong> Select
                the TXT files to ingest device system logs for debugging and
                diagnostics.
              </p>
            </>
          )}
        </CardContent>
      </Card>

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
            "cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground",
          )}
        >
          <UploadIcon
            size={28}
            className="text-muted-foreground mx-auto mb-3"
          />
          <p className="text-foreground text-sm font-medium">
            {mode === "jumps"
              ? "Drop CSV + JSON pairs here"
              : mode === "summaries"
                ? "Drop summary JSON files here"
                : "Drop TXT files here"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {mode === "jumps"
              ? "action_*.csv and s_action_*.json files"
              : mode === "summaries"
                ? "s_action_*.json files to update existing jumps"
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
          <CardContent className="px-4 pt-3 pb-1">
            <p className="text-muted-foreground pb-2 text-xs">
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </p>
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className={cn(
                  "border-border flex items-center justify-between border-b py-2 last:border-0",
                  // Highlight orphan CSVs (no matching JSON) for jump logs.
                  mode === "jumps" &&
                    f.name.toLowerCase().endsWith(".csv") &&
                    missingSummaries.some((m) => m === f.name) &&
                    "bg-yellow-500/5",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-foreground truncate text-sm">
                    {f.name}
                  </span>
                  {mode === "jumps" &&
                    f.name.toLowerCase().endsWith(".csv") &&
                    missingSummaries.some((m) => m === f.name) && (
                      <span className="shrink-0 rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-600">
                        missing JSON
                      </span>
                    )}
                </div>
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
          {mode === "summaries"
            ? `Update ${uploadItemCount} jump${uploadItemCount !== 1 ? "s" : ""}`
            : `Upload ${uploadItemCount} item${uploadItemCount !== 1 ? "s" : ""}`}
        </Button>
      )}

      {uploading && (
        <Button onClick={handleCancel} variant="outline" className="w-full">
          <StopCircle size={16} className="mr-2" />
          Cancel Upload
        </Button>
      )}

      {/* Progress indicator */}
      {uploading && (
        <Card>
          <CardContent className="px-4 pt-3">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={15} className="text-primary animate-spin" />
              <p className="text-foreground">
                {activeCount === 1
                  ? `Uploading ${completedCount + 1} of ${uploadItemCount}`
                  : `Uploading ${completedCount + activeCount} of ${uploadItemCount} (${activeCount} in parallel)`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global error (non-per-file) */}
      {globalError && (
        <Card>
          <CardContent className="pt-3">
            <p className="text-destructive text-sm">{globalError}</p>
          </CardContent>
        </Card>
      )}

      {/* Jump results — live as they complete */}
      {jumpResults.length > 0 && (
        <Card>
          <CardContent className="px-4 pt-3 pb-1">
            <p className="text-muted-foreground pb-2 text-xs">
              {jumpResults.filter((r) => r.status === "created").length} new ·{" "}
              {jumpResults.filter((r) => r.status === "duplicate").length}{" "}
              duplicate
              {jumpResults.filter((r) => r.status === "error").length > 0 &&
                ` · ${jumpResults.filter((r) => r.status === "error").length} failed`}
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
          <CardContent className="px-4 pt-3 pb-1">
            <p className="text-muted-foreground pb-2 text-xs">
              {logResults.length} uploaded
              {uploading && " · uploading…"}
            </p>
            {logResults.map((r, i) => (
              <LogResultItem key={`${r.file}-${i}`} r={r} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary update results */}
      {summaryResults.length > 0 && (
        <Card>
          <CardContent className="px-4 pt-3 pb-1">
            <p className="text-muted-foreground pb-2 text-xs">
              {summaryResults.filter((r) => r.status === "updated").length}{" "}
              updated
              {summaryResults.filter((r) => r.status === "error").length > 0 &&
                ` · ${summaryResults.filter((r) => r.status === "error").length} failed`}
              {uploading && " · updating…"}
            </p>
            {summaryResults.map((r, i) => (
              <div
                key={`${r.csv}-${i}`}
                className="border-border flex items-start gap-2 border-b py-2.5 text-sm last:border-0"
              >
                {r.status === "updated" ? (
                  <CheckCircle
                    size={15}
                    className="text-primary mt-0.5 shrink-0"
                  />
                ) : (
                  <AlertCircle
                    size={15}
                    className="text-destructive mt-0.5 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-foreground truncate">{r.csv}</p>
                  {r.status === "updated" && (
                    <p className="text-muted-foreground text-xs">
                      Jump metadata updated
                    </p>
                  )}
                  {r.error && (
                    <p className="text-destructive text-xs">{r.error}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
