export const ASCENSION_ICON_BASE = "https://db.ascension.gg/static/images/wow/icons";

export function ascensionIconUrl(icon?: string | null, size: "small" | "medium" | "large" = "large"): string | undefined {
  if (!icon) return undefined;
  const safeName = icon.toLowerCase().replace(/[^a-z0-9_()\-]/g, "");
  if (!safeName) return undefined;
  return `${ASCENSION_ICON_BASE}/${size}/${encodeURIComponent(safeName)}.jpg`;
}
