// app/api/render/route.ts
import { NextResponse } from "next/server";
import { chartSvgBuilders } from "@/lib/chart-svgs";
import type { ChartType } from "@/types/charts";

export async function POST(req: Request) {
  try {
    const { chartType, args } = (await req.json()) as {
      chartType: ChartType;
      args: any;
    };

    if (!chartType || !args) {
      return NextResponse.json({ error: "Faltan chartType o args" }, { status: 400 });
    }

    const builder = chartSvgBuilders[chartType];
    if (typeof builder !== "function") {
      return NextResponse.json({ error: `chartType inválido: ${chartType}` }, { status: 400 });
    }

    const svg = builder(args);

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
