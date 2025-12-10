import type { Brand } from "@/types/brand";
import { ChartConfig } from "@/lib/chartconfig";

export type BrandTheme = {
  fontFamily: string;
  headerLines?: string[];
  footer?: string;
  defaultBackground: string;
  defaultTextColor: string;
};

export function getBrandTheme(brand: Brand): BrandTheme {
  // 🔹 CENS / EDMUND / SINSA
  if (brand === "censEdmundSinsa") {
    return {
      // 👇 SIN comillas internas
      fontFamily: "Coolvetica Rg, Helvetica, Arial, sans-serif",
      footer: "",
      defaultBackground: "#ffffff",
      defaultTextColor: "#1b7f7a",
    };
  }

  // 🔹 DESKOVER (placeholder por ahora)
  if (brand === "deskover") {
    return {
      fontFamily: "Geist, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      footer: "",
      defaultBackground: "#ffffff",
      defaultTextColor: "#000000",
    };
  }

  // 🔹 POLIGRAMA (default)
  return {
    fontFamily:
      ChartConfig.typography.fontFamily ?? "Helvetica, Arial, sans-serif",
    headerLines: ["Poligrama.", "Poder.", "Ganar."],
    footer: ChartConfig.footer,
    defaultBackground: "#000000",
    defaultTextColor: "#ffffff",
  };
}
