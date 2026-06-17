import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign In · UpTime.Pro" };

export default function LoginPage() {
  // useSearchParams() must be inside a Suspense boundary during static render.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
