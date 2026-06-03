import { NextResponse } from "next/server";
import { checkAesKey, getLiveAesKey } from "@/lib/peachify";

export async function GET() {
  try {
    const result = await checkAesKey();
    const statusCode = result.status === "ok" ? 200 : result.status === "changed" ? 200 : 503;
    return NextResponse.json(result, { status: statusCode });
  } catch (e) {
    console.error("[/api/check-key] Error:", e);
    return NextResponse.json(
      {
        status: "error",
        currentKey: getLiveAesKey(),
        decryptionTested: false,
        error: e instanceof Error ? e.message : "Unknown error",
        checkedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
