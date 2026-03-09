import { supabase } from "@/integrations/supabase/client";

export function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export async function getProjectLogoUrl(logoPath: string | null | undefined) {
  if (!logoPath) return null;
  const { data, error } = await supabase.storage.from("project-logos").createSignedUrl(logoPath, 60);
  if (error) return null;
  return data.signedUrl;
}
