import { Suspense } from "react";
import { VerifyForm } from "@/components/auth/VerifyForm";

export const metadata = { title: "Verify email · መጽሐፍ ቅዱስ" };

export default function VerifyPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <Suspense fallback={null}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
