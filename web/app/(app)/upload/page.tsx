"use client";

import { useState, useRef, useCallback, useMemo } from "react";
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

type Tab = "jumps" | "logs" | "summaries";
type Device = "dekunu" | "generic";

// ─── Discipline type ID map (Dekunu) ──────────────────────────────────────────

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
    const summary = jsons.get(summaryName) ?? jsons.get(summaryName.toLowerCase());
    return { csv, summary };
  });
}

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>("jumps");
  const [device, setDevice] = useState<Device>("dekunu");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    active: [],
    completed: new Set<number>(),
    cancelled: false,
  });
  const [jumpResults, setJumpResults] = useState<IngestResult[]>([]);
  const [logResults, setLogResults] = useState<LogResult[]>([]);
  const [summaryResults, setSummaryResults] = useState<SummaryUpdateResult[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRefs = useRef<Map<number, AbortController>>(new Map());

  const uploading = uploadState.active.length > 0;
  const ext = tab === "jumps"
    ? device === "dekunu" ? ".csv,.json" : ".csv"
    : tab === "logs"
      ? ".txt"
      : ".json";

  // Build file pairs for validation and display.
  const pairs = useMemo(() => {
    if (tab !== "jumps" || device !== "dekunu") return null;
    return pairFiles(files);
  }, [files, tab, device]);

  // Check for CSVs missing their summary JSON (Dekunu only).
  const missingSummaries = useMemo(() => {
    if (!pairs || device !== "dekunu") return [];
    return pairs
      .filter((p) => !p.summary)
      .map((p) => p.csv.name);
  }, [pairs, device]);

  function switchTab(next: Tab) {
    if (uploading) return;
    setTab(next);
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
      if (tab === "logs") return lower.endsWith(".txt");
      if (tab === "summaries") return lower.endsWith(".json");
      if (device === "dekunu") return lower.endsWith(".csv") || lower.endsWith(".json");
      return lower.endsWith(".csv");
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
    setUploadState((s) => ({ ...s, cancelled: true }));
    abortRefs.current.forEach((ac) => ac.abort());
  }, []);

  async function handleUpload() {
    if (!files.length) return;

    // For Dekunu: reject if any CSV is missing its summary JSON.
    if (tab === "jumps" && device === "dekunu" && missingSummaries.length > 0) {
      setGlobalError(
        `Missing summary JSON for: ${missingSummaries.join(", ")}. Each CSV must have a matching s_*.json file.`,
      );
      return;
    }

    setUploadState({ active: [], completed: new Set<number>(), cancelled: false });
    setJumpResults([]);
    setLogResults([]);
    setSummaryResults([]);
    setGlobalError(null);
    abortRefs.current.clear();

    if (tab === "logs") {
      await uploadSystemLogs();
    } else if (tab === "summaries") {
      await uploadSummaries();
    } else if (device === "dekunu") {
      await uploadDekunuPairs();
    } else {
      await uploadGenericCsvs();
    }

    setUploadState({ active: [], completed: new Set<number>(), cancelled: false });
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
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);

        const result = data.results?.[0] ?? {
          file: p[i].csv.name,
          status: "error",
          error: "No result returned",
        };
        results[i] = result;
        setJumpResults(
          results.filter(
            (r): r is IngestResult =>
              r != null && "status" in r && typeof (r as IngestResult).status === "string",
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setUploadState((s) => ({ ...s, cancelled: true }));
        } else {
          const errorMsg =
            err instanceof Error ? err.message : "Upload failed";
          results[i] = {
            file: p[i].csv.name,
            status: "error",
            error: errorMsg,
          } as IngestResult;
          setJumpResults(
            results.filter(
              (r): r is IngestResult =>
                r != null && "status" in r && typeof (r as IngestResult).status === "string",
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
    const results: (SummaryUpdateResult | null)[] = new Array(jsons.length).fill(null);
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

  async function uploadGenericCsvs() {
    const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    const endpoint = "/api/jumps/upload";
    const results: (IngestResult | null)[] = new Array(csvs.length).fill(null);
    let nextIndex = 0;

    async function uploadFile(i: number) {
      if (uploadState.cancelled) return;
      const ac = new AbortController();
      abortRefs.current.set(i, ac);

      setUploadState((s) => ({ ...s, active: [...s.active, i] }));

      const formData = new FormData();
      formData.append("file", csvs[i]);

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
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);

        const result = data.results?.[0] ?? {
          file: csvs[i].name,
          status: "error",
          error: "No result returned",
        };
        results[i] = result;
        setJumpResults(
          results.filter(
            (r): r is IngestResult =>
              r != null && "status" in r && typeof (r as IngestResult).status === "string",
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setUploadState((s) => ({ ...s, cancelled: true }));
        } else {
          const errorMsg =
            err instanceof Error ? err.message : "Upload failed";
          results[i] = {
            file: csvs[i].name,
            status: "error",
            error: errorMsg,
          } as IngestResult;
          setJumpResults(
            results.filter(
              (r): r is IngestResult =>
                r != null && "status" in r && typeof (r as IngestResult).status === "string",
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
    for (let w = 0; w < CONCURRENCY && w < csvs.length; w++) {
      workers.push(
        (async () => {
          while (nextIndex < csvs.length) {
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
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);

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
    tab === "logs"
      ? files.filter((f) => f.name.toLowerCase().endsWith(".txt")).length
      : tab === "summaries"
        ? files.filter((f) => f.name.toLowerCase().endsWith(".json")).length
        : device === "dekunu"
          ? pairs?.length ?? 0
          : files.filter((f) => f.name.toLowerCase().endsWith(".csv")).length;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <h2 className="text-xl font-bold text-foreground">Upload</h2>

      {/* Tab toggle */}
      <div className="flex bg-muted rounded-md p-1 gap-1">
        {(["jumps", "summaries", "logs"] as const).map((t) => (
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
            {t === "jumps" ? "Jump Logs" : t === "summaries" ? "Update Jumps" : "System Logs"}
          </button>
        ))}
      </div>

      {/* Device selector (jumps tab only) */}
      {tab === "jumps" && !uploading && (
        <div className="relative">
          <select
            value={device}
            onChange={(e) => {
              setDevice(e.target.value as Device);
              setFiles([]);
              setJumpResults([]);
              setGlobalError(null);
            }}
            className="w-full rounded-md border border-border bg-input text-foreground text-sm px-3 py-2 appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="dekunu">Dekunu</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        </div>
      )}

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
            {tab === "jumps"
              ? device === "dekunu"
                ? "Drop CSV + JSON pairs here"
                : "Drop CSV files here"
              : tab === "summaries"
                ? "Drop summary JSON files here"
                : "Drop TXT files here"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {tab === "jumps"
              ? device === "dekunu"
                ? "action_*.csv and s_action_*.json files"
                : "Generic CSV format"
              : tab === "summaries"
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
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </p>
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className={cn(
                  "flex items-center justify-between py-2 border-b border-border last:border-0",
                  // Highlight orphan CSVs (no matching JSON) for Dekunu.
                  tab === "jumps" &&
                    device === "dekunu" &&
                    f.name.toLowerCase().endsWith(".csv") &&
                    missingSummaries.some((m) => m === f.name) &&
                    "bg-yellow-500/5",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-foreground truncate">
                    {f.name}
                  </span>
                  {tab === "jumps" &&
                    device === "dekunu" &&
                    f.name.toLowerCase().endsWith(".csv") &&
                    missingSummaries.some((m) => m === f.name) && (
                      <span className="text-[10px] text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded shrink-0">
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
          {tab === "summaries"
            ? `Update ${uploadItemCount} jump${uploadItemCount !== 1 ? "s" : ""}`
            : `Upload ${uploadItemCount} jump${uploadItemCount !== 1 ? "s" : ""}`}
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
          <CardContent className="pt-3 px-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={15} className="animate-spin text-primary" />
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
            <p className="text-sm text-destructive">{globalError}</p>
          </CardContent>
        </Card>
      )}

      {/* Jump results — live as they complete */}
      {jumpResults.length > 0 && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {jumpResults.filter((r) => r.status === "created").length} new ·{" "}
              {jumpResults.filter((r) => r.status === "duplicate").length} duplicate
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

      {/* Summary update results */}
      {summaryResults.length > 0 && (
        <Card>
          <CardContent className="pt-3 pb-1 px-4">
            <p className="text-xs text-muted-foreground pb-2">
              {summaryResults.filter((r) => r.status === "updated").length} updated
              {summaryResults.filter((r) => r.status === "error").length > 0 &&
                ` · ${summaryResults.filter((r) => r.status === "error").length} failed`}
              {uploading && " · updating…"}
            </p>
            {summaryResults.map((r, i) => (
              <div key={`${r.csv}-${i}`} className="flex items-start gap-2 py-2.5 border-b border-border last:border-0 text-sm">
                {r.status === "updated" ? (
                  <CheckCircle size={15} className="shrink-0 mt-0.5 text-primary" />
                ) : (
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="text-foreground truncate">{r.csv}</p>
                  {r.status === "updated" && (
                    <p className="text-xs text-muted-foreground">Jump metadata updated</p>
                  )}
                  {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
