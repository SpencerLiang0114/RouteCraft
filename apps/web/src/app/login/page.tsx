import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="font-semibold text-emerald-800">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
