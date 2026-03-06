export default function NotImplemented({ title }: { title: string }) {
  return (
    <div className="rounded-3xl border bg-white p-6">
      <div className="text-sm font-semibold text-[hsl(var(--ink))]">{title}</div>
      <p className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
        Esta tela entra na próxima etapa do MVP.
      </p>
    </div>
  );
}
