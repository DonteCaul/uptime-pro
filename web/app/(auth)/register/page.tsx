import { Suspense } from "react";
import { LoginForm } from "../login/login-form";

export const metadata = { title: "Register · UpTime.Pro" };

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm initialMode="register" />
    </Suspense>
  );
}
