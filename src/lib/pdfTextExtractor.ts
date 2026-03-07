// Extração simples de texto de PDF (MVP da Etapa 2)
// Observação: PDF com tabela "de verdade" pode não virar estrutura perfeita sem um parser de tabela;
// aqui a meta é extrair texto para prévia/conferência e evoluir para OCR/parser na Etapa 3.

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";

(pdfjsLib as any).GlobalWorkerOptions.workerPort = new (pdfWorker as any)();

export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await (pdfjsLib as any).getDocument({ data }).promise;

  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items ?? [];
    const pageText = items
      .map((it: any) => String(it.str ?? "").trim())
      .filter(Boolean)
      .join(" ");

    out += (out ? "\n\n" : "") + `# Página ${p}\n` + pageText;
  }

  return out;
}