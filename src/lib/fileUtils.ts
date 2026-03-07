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
