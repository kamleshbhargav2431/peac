import { NextRequest, NextResponse } from "next/server";
import { fetchDecodedMedia } from "@/lib/peachify";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ tmdbId: string; season: string; episode: string }>;
  }
) {
  const { tmdbId: tmdbIdStr, season: seasonStr, episode: episodeStr } = await params;
  const tmdbId = parseInt(tmdbIdStr, 10);
  const season = parseInt(seasonStr, 10);
  const episode = parseInt(episodeStr, 10);

  if (isNaN(tmdbId) || tmdbId <= 0) {
    return NextResponse.json(
      { error: "Invalid TMDB ID. Must be a positive integer." },
      { status: 400 }
    );
  }

  if (isNaN(season) || season <= 0) {
    return NextResponse.json(
      { error: "Invalid season number. Must be a positive integer." },
      { status: 400 }
    );
  }

  if (isNaN(episode) || episode <= 0) {
    return NextResponse.json(
      { error: "Invalid episode number. Must be a positive integer." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const server = searchParams.get("server") ?? undefined;

  try {
    const result = await fetchDecodedMedia("tv", tmdbId, season, episode, server);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/tv] Error:", e);
    return NextResponse.json(
      { error: "Failed to fetch TV show data", tmdbId, season, episode },
      { status: 500 }
    );
  }
}
