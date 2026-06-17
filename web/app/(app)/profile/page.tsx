import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Profile · UpTime.Pro" };

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Profile editing (gear, ratings, home DZ, avatar) lands in Phase 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
