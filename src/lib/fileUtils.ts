import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import type { Vendor } from "@/lib/supabaseTypes";

export type PaymentMethod = "transferencia" | "cheque" | "boleto" | "pix";

export function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function monthRefFromIndex(index1: number) {
  const base = new Date(Date.UTC(2000, 0, 1));
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + (index1 - 1), 1));
  return d.toISOString().slice(0, 10);
}

export async function compressPdf(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  const out = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return out;
}

export function downloadBlobUrl(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function fetchVendorById(vendorId: string): Promise<Vendor | null> {
  const { data, error } = await supabase.from("vendors").select("*").eq("id", vendorId).single();
  if (error) return null;
  return (data as Vendor) ?? null;
}

export async function imageToLowResPdfBytes(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Falha ao ler imagem"));
      el.src = url;
    });

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Falha ao converter imagem");
    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", 0.6)
    );

    const jpgBytes = new Uint8Array(await blob.arrayBuffer());

    const pdf = await PDFDocument.create();
    const jpg = await pdf.embedJpg(jpgBytes);
    const page = pdf.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });

    const out = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function safePdfFileName(inputName: string) {
  const safe = safeFileName(inputName || "anexo.pdf");
  const noExt = safe.replace(/\.[a-zA-Z0-9]+$/, "");
  return `${noExt}.pdf`;
}

export async function fileToLowResPdf(file: File): Promise<{ bytes: Uint8Array; fileName: string; sizeBytes: number }> {
  if (file.type === "application/pdf") {
    const bytes = await compressPdf(file);
    const fileName = safePdfFileName(file.name || "anexo.pdf");
    return { bytes, fileName, sizeBytes: bytes.byteLength };
  }

  if (file.type.startsWith("image/")) {
    const bytes = await imageToLowResPdfBytes(file);
    const fileName = safePdfFileName(file.name || "imagem.pdf");
    return { bytes, fileName, sizeBytes: bytes.byteLength };
  }

  throw new Error("Formato de anexo não suportado. Envie PDF ou imagem.");
}

export function safeFileExt(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const ok = ["csv", "xls", "xlsx", "pdf", "png", "jpg", "jpeg"];
  return ok.includes(ext) ? ext : "bin";
}

export function safeBaseName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

export function buildProjectStoragePath(projectId: string, fileName: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = safeBaseName(fileName || "arquivo");
  return `${projectId}/${ts}-${base}`;
}
