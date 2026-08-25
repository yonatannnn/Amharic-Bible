import { AddFriendByLink } from "@/components/app/AddFriendByLink";

export const metadata = { title: "Add friend · መጽሐፍ ቅዱስ" };

export default async function AddPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <AddFriendByLink username={username} />
    </div>
  );
}
