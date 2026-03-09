export async function invokeEdgeFunctionOrThrow<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke(
    name,
    { body }
  );

  if (error) {
    const msg = (error as any)?.message ?? "Falha ao chamar Edge Function";
    const ctx = (error as any)?.context;
    const details =
      typeof (error as any)?.details === "string"
        ? (error as any).details
        : ctx
          ? JSON.stringify(ctx)
          : "";

    throw new Error(details ? `${msg}: ${details}` : msg);
  }

  // Quando a função retorna 200 com { ok: false, message }, levantamos erro amigável
  if (data && typeof data === "object" && "ok" in (data as any)) {
    const d: any = data;
    if (d.ok === false) {
      const msg = d.message || "Falha ao processar com IA";
      throw new Error(msg);
    }
  }

  return data as T;
}