import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  name: string;
  value: number;
};

const palette = [
  "#2563EB", // blue
  "#0D9488", // teal
  "#F59E0B", // amber
  "#7C3AED", // violet
  "#EF4444", // red
  "#22C55E", // green
  "#06B6D4", // cyan
  "#F97316", // orange
  "#DB2777", // pink
  "#64748B", // slate
];

function pct(value: number, total: number) {
  if (!total || total <= 0) return 0;
  return value / total;
}

function buildStops(items: Array<Item & { color: string }>, total: number) {
  let acc = 0;
  const parts: string[] = [];

  for (const it of items) {
    const p = pct(it.value, total);
    const start = acc * 100;
    const end = (acc + p) * 100;
    // Sharp transitions (solid slices)
    parts.push(`${it.color} ${start.toFixed(4)}% ${end.toFixed(4)}%`);
    acc += p;
  }

  // Ensure full circle even with rounding
  if (acc < 1) parts.push(`#E5E7EB ${(acc * 100).toFixed(4)}% 100%`);

  return `conic-gradient(${parts.join(", ")})`;
}

export function ProjectsShareDonut({ items }: { items: Item[] }) {
  const data = useMemo(() => {
    const cleaned = (items ?? []).filter((i) => Number(i.value ?? 0) > 0);
    const sorted = cleaned.slice().sort((a, b) => b.value - a.value);

    const MAX = 8;
    const head = sorted.slice(0, MAX);
    const tail = sorted.slice(MAX);
    const othersValue = tail.reduce((acc, i) => acc + i.value, 0);

    const final: Item[] = othersValue > 0 ? [...head, { id: "others", name: "Outros", value: othersValue }] : head;

    const total = final.reduce((acc, i) => acc + i.value, 0);

    const withColors = final.map((i, idx) => ({ ...i, color: palette[idx % palette.length] }));

    return { total, items: withColors };
  }, [items]);

  const bg = useMemo(() => buildStops(data.items, data.total), [data.items, data.total]);

  return (
    <Card className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-[hsl(var(--ink))]">
            Participação por projeto
          </div>
          <div className="mt-1 text-sm text-[hsl(var(--muted-ink))]">
            Percentual do <span className="font-medium text-[hsl(var(--ink))]">total planejado</span> (todos os projetos)
          </div>
        </div>

        <div className="rounded-full bg-[hsl(var(--app-bg))] px-3 py-1 text-xs font-semibold text-[hsl(var(--ink))]">
          Total: {formatBRL(data.total)}
        </div>
      </div>

      {data.total <= 0 ? (
        <div className="mt-5 rounded-2xl border bg-[hsl(var(--app-bg))] p-4 text-sm text-[hsl(var(--muted-ink))]">
          Sem valores planejados. Crie/importa um orçamento em pelo menos um projeto para ver o gráfico.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="flex justify-center md:justify-start">
            <div className="relative h-[200px] w-[200px]">
              <div
                className="h-full w-full rounded-full ring-1 ring-black/5"
                style={{ background: bg }}
                aria-hidden
              />
              <div className="absolute inset-6 grid place-items-center rounded-full bg-white ring-1 ring-black/5">
                <div className="text-center">
                  <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Total</div>
                  <div className="mt-1 text-lg font-semibold tracking-tight text-[hsl(var(--ink))]">
                    {formatBRL(data.total)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {data.items.map((it) => {
              const p = pct(it.value, data.total);
              return (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border bg-white px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: it.color }} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[hsl(var(--ink))]">{it.name}</div>
                      <div className="text-xs text-[hsl(var(--muted-ink))]">{formatBRL(it.value)}</div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex-none rounded-full px-2 py-1 text-xs font-semibold",
                      "bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand-strong))]"
                    )}
                  >
                    {(p * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
