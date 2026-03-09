export async function invokeEdgeFunctionOrThrow<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke(
    name,
    { body }
  );

  if (error) {
    const msg = (error as any)?.message ?? "Falha ao chamar Edge Function";
    const ctx = (error as any)?.context;
    // Tenta extrair detalhes do response (quando disponível)
    const details =
      typeof (error as any)?.details === "string"
        ? (error as any).details
        : ctx
          ? JSON.stringify(ctx)
          : "";

    throw new Error(details ? `${msg}: ${details}` : msg);
  }

  return data as T;
}
