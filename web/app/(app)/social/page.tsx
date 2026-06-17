import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Social · UpTime.Pro" };

export const revalidate = 60; // ISR — leaderboard cache, 60s

export default function SocialPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Social</h1>
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Public leaderboards and home-DZ globe land in Phase 3, with ISR
            caching to avoid recomputing the four aggregations per request.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
