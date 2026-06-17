import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Settings · UpTime.Pro" };

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Theme toggle and units preference land in Phase 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
