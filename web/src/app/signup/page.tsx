import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign up · መጽሐፍ ቅዱስ" };

export default function SignupPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <AuthForm mode="signup" />
    </div>
  );
}
