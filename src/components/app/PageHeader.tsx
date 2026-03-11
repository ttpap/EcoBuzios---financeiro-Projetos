import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  badge?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ badge, title, description, actions, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "rounded-[28px] border bg-white p-6 shadow-sm",
        "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {badge ? <div className="mb-3">{badge}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--ink))] sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <div className="mt-2 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-ink))]">
            {description}
          </div>
        ) : null}
      </div>

      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
