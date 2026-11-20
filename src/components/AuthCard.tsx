import Link from "next/link";

/** Sign-in and sign-up: a chitenge band, the brand, and the form on a warm card. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="chitenge h-3" aria-hidden />
      <main className="flex min-h-[calc(100dvh-0.75rem)] items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link
              href="/"
              className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white shadow-[0_12px_28px_-10px_rgb(180_68_28/0.8),inset_0_-4px_0_rgb(0_0_0/0.15)]"
              aria-label="Kantemba home"
            >
              K
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Kantemba</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
          <div className="card p-6">{children}</div>
          <p className="mt-5 text-center text-sm text-muted">{footer}</p>
          <p className="mt-8 text-center text-xs text-muted">Stock, sales and credit for Zambian shops</p>
        </div>
      </main>
    </div>
  );
}
