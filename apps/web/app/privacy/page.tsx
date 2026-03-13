import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="py-8">
      <Link
        href="/"
        className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted mb-8"
      >
        ← Back
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-6 text-muted-foreground">
        Privacy policy content will be added here.
      </p>
    </main>
  );
}
