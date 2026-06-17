import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Upload · UpTime.Pro" };

export default function UploadPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Upload</h1>
      <Card>
        <CardHeader>
          <CardTitle>Jump &amp; System Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            CSV upload lands in Phase 2. It will parse Dekunu-format files and
            store telemetry via the shared ingest pipeline.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
