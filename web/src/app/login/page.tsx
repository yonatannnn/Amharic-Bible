import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in · መጽሐፍ ቅዱስ" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <AuthForm mode="login" />
    </div>
  );
}
