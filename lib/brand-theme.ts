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
      fontFamily:  "Futura Condensed ExtraBold, Futura, Arial, sans-serif",
      footer: "",
      defaultBackground: "#232323",
      defaultTextColor: "#ffffff",
    };
  }

  // 🔹 POLIGRAMA (default)
  return {
    fontFamily:
      ChartConfig.typography.fontFamily ?? "Helvetica, Arial, sans-serif",
    footer: ChartConfig.footer,
    defaultBackground: "#000000",
    defaultTextColor: "#ffffff",
  };
}
