import { NextRequest, NextResponse } from "next/server";
import { fetchDecodedMedia } from "../../../lib/peachify";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tmdbId: string }> }
) {
  const { tmdbId: tmdbIdStr } = await params;
  const tmdbId = parseInt(tmdbIdStr, 10);

  if (isNaN(tmdbId) || tmdbId <= 0) {
    return NextResponse.json(
      { error: "Invalid TMDB ID. Must be a positive integer." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const server = searchParams.get("server") ?? undefined;

  try {
    const result = await fetchDecodedMedia("movie", tmdbId, undefined, undefined, server);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/movie] Error:", e);
    return NextResponse.json(
      { error: "Failed to fetch movie data", tmdbId },
      { status: 500 }
    );
  }
}
