import getNowPlayingItem from "@/components/SpotifyStatus/SpotifyAPI";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Handles the GET request to fetch the currently playing item from Spotify.
 *
 * @returns {Promise<NextResponse>} A promise that resolves to a JSON response containing the currently playing item data or an error message.
 *
 * @throws {Error} If there is an issue fetching the currently playing item, it returns a JSON response with an error message and a 500 status code.
 */
export async function GET(request: NextRequest) {
  try {
    const forceRefresh =
      request.nextUrl.searchParams.get("refresh") === "true" ||
      request.nextUrl.searchParams.get("forceRefresh") === "true";

    const data = await getNowPlayingItem({ forceRefresh });
    return NextResponse.json(data, {
      headers: corsHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch ${error}` },
      { status: 500, headers: corsHeaders },
    );
  }
}

export function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: corsHeaders,
    },
  );
}
