import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GeminiBudget = {
  titulo_planilha?: string;
  nome_projeto?: string;
  meses_referencia?: number;
  itens?: Array<{
    codigo: string;
    titulo: string;
    total_item?: number;
    subitens?: Array<{ codigo: string; titulo: string; valor: number }>;
  }>;
  total_geral?: number;
};

function buildPrompt(input: {
  fileName?: string;
  mimeType?: string;
  extractedText?: string;
  hintMonths?: number;
}): string {
  const { fileName, mimeType, extractedText, hintMonths } = input;

  return [
    "Você é um assistente especializado em interpretar planilhas orçamentárias brasileiras.",
    "Extraia uma estrutura hierárquica de itens (ex.: 1, 1.1, 2.2.1), títulos e valores.",
    "Retorne APENAS JSON válido (sem markdown, sem comentários, sem texto extra).",
    "Se algum campo não puder ser identificado, use null ou 0.",
    "\nCampos exigidos no JSON:",
    "- titulo_planilha (string)",
    "- nome_projeto (string)",
    "- meses_referencia (number)",
    "- itens: array de { codigo, titulo, total_item, subitens: [{codigo,titulo,valor}] }",
    "- total_geral (number)",
    "\nRegras:",
    "1) Valores devem ser NUMÉRICOS (use ponto como separador decimal).",
    "2) Não invente itens; use apenas o que aparece no conteúdo.",
    "3) Se não houver total_item, calcule como soma dos subitens.",
    "4) Se total_geral não existir, calcule como soma dos totais dos itens.",
    "\nContexto do arquivo:",
    `Arquivo: ${fileName ?? "(desconhecido)"}`,
    `MIME: ${mimeType ?? "(desconhecido)"}`,
    `Dica meses: ${hintMonths ?? 0}`,
    "\nConteúdo extraído (trecho):",
    // Mantemos curto para não estourar quota/tokens do free tier
    extractedText?.slice(0, 8000) ?? "",
  ].join("\n");
}

function normalizeToParsedBudget(g: GeminiBudget) {
  const items = g.itens ?? [];

  const categories = items.map((it, idx) => ({
    key: `item_${idx + 1}`,
    name: it.titulo || `Item ${idx + 1}`,
  }));

  const lines: Array<any> = [];

  items.forEach((it, idx) => {
    const subs = it.subitens ?? [];
    subs.forEach((s) => {
      lines.push({
        categoryKey: categories[idx].key,
        code: s.codigo,
        name: s.titulo,
        totalApproved: Number(s.valor ?? 0),
        quantity: null,
        unitValue: null,
        isSubtotal: false,
      });
    });
  });

  const computedTotalGeral =
    Number(g.total_geral ?? 0) ||
    lines.reduce((acc, l) => acc + Number(l.totalApproved ?? 0), 0);

  return {
    titulo_planilha: g.titulo_planilha ?? "",
    nome_projeto: g.nome_projeto ?? "",
    meses_referencia: Number(g.meses_referencia ?? 0),
    itens: items,
    total_geral: computedTotalGeral,

    // compatível com a conferência atual
    categories,
    lines,
    detected: { totalGeneral: computedTotalGeral },
  };
}

function ok<T>(payload: T) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(payload: { message: string; code?: number; retryAfterSeconds?: number }) {
  return new Response(JSON.stringify({ ok: false, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("[gemini-parse-budget] Missing GEMINI_API_KEY");
      return fail({ message: "Secret GEMINI_API_KEY não configurada no Supabase." });
    }

    const body = await req.json();
    const prompt = buildPrompt({
      fileName: body.fileName,
      mimeType: body.mimeType,
      extractedText: body.extractedText,
      hintMonths: body.hintMonths,
    });

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1400,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!resp.ok) {
      const t = await resp.text();
      console.error("[gemini-parse-budget] Gemini request failed", {
        status: resp.status,
        body: t,
      });

      if (resp.status === 429) {
        const match = t.match(/"retryDelay"\s*:\s*"(\d+)s"/);
        const retryAfterSeconds = match ? Number(match[1]) : undefined;
        return fail({
          code: 429,
          retryAfterSeconds,
          message:
            retryAfterSeconds != null
              ? `Cota do Gemini excedida. Tente novamente em ~${retryAfterSeconds}s (ou habilite faturamento/upgrade).`
              : "Cota do Gemini excedida. Aguarde e tente novamente (ou habilite faturamento/upgrade).",
        });
      }

      return fail({
        code: resp.status,
        message: "Falha ao consultar o Gemini. Verifique sua chave/limites e tente novamente.",
      });
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: GeminiBudget;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      console.error("[gemini-parse-budget] Failed to parse JSON", {
        textSnippet: String(text).slice(0, 500),
      });
      return fail({
        message:
          "O Gemini não retornou JSON válido. Tente novamente ou envie um PDF/planilha com layout mais simples.",
      });
    }

    const normalized = normalizeToParsedBudget(parsed);
    return ok({ parsed: normalized });
  } catch (e) {
    console.error("[gemini-parse-budget] Unhandled error", { error: String(e) });
    return fail({ message: "Erro interno na função de IA. Tente novamente." });
  }
});