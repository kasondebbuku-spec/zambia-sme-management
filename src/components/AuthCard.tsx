import Link from "next/link";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white" aria-label="Kantemba home">
            K
          </Link>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">{children}</div>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </main>
  );
}
