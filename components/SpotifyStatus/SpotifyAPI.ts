import queryString from "query-string";

type SpotifyNowPlaying = {
  artist: string;
  isPlaying: boolean;
  title: string;
};

const client_id = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
const client_secret = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_SECRET;
const refresh_token = process.env.NEXT_PUBLIC_SPOTIFY_REFRESH_TOKEN;

const TOKEN_EXPIRY_BUFFER = 60 * 1000; // 60 seconds
const NOW_PLAYING_TTL =
  Number(process.env.SPOTIFY_NOW_PLAYING_CACHE_TTL ?? 10000);

// Cache structure to store the token and its expiration
let tokenCache = {
  access_token: null as string | null,
  expires_at: 0,
};

let nowPlayingCache: {
  payload: SpotifyNowPlaying | false | null;
  expires_at: number;
} = {
  payload: null,
  expires_at: 0,
};

// Store last played track even when paused/stopped
let lastPlayedTrack: SpotifyNowPlaying | null = null;

/**
 * Retrieves an access token for the Spotify API.
 *
 * This function first checks if there is a cached token that is still valid.
 * If a valid cached token is found, it returns the token.
 * Otherwise, it requests a new token from the Spotify API using the refresh token.
 * The new token is then cached with an expiration time.
 *
 * @returns {Promise<{ access_token: string }>} An object containing the access token.
 */
const getAccessToken = async () => {
  // Check if we have a cached token that's still valid
  if (
    tokenCache.access_token &&
    tokenCache.expires_at &&
    Date.now() < tokenCache.expires_at
  ) {
    return { access_token: tokenCache.access_token };
  }

  // If no valid token in cache, request a new one
  const concatenatedString = `${client_id}:${client_secret}`;
  const basic = Buffer.from(concatenatedString).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: queryString.stringify({
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  const data = await response.json();

  // Cache the new token with expiration
  // Spotify tokens typically expire in 1 hour (3600 seconds)
  // We subtract 60 seconds as a buffer
  tokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_BUFFER,
  };

  return { access_token: data.access_token };
};

const fetchNowPlayingFromSpotify = async () => {
  const { access_token } = await getAccessToken();

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
      // Add cache control headers to prevent caching
      cache: "no-store",
      next: { revalidate: 0 },
    },
  );

  return response;
};

const fetchRecentlyPlayed = async () => {
  const { access_token } = await getAccessToken();

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=1",
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
      cache: "no-store",
      next: { revalidate: 0 },
    },
  );

  return response;
};

type GetNowPlayingOptions = {
  forceRefresh?: boolean;
};

export async function getNowPlaying(
  options?: GetNowPlayingOptions,
): Promise<SpotifyNowPlaying | false> {
  const forceRefresh = options?.forceRefresh ?? false;

  if (
    !forceRefresh &&
    nowPlayingCache.payload !== null &&
    Date.now() < nowPlayingCache.expires_at
  ) {
    return nowPlayingCache.payload;
  }

  const response = await fetchNowPlayingFromSpotify();
  
  // If nothing is currently playing (204), try to get recently played
  if (response.status === 204) {
    try {
      const recentlyPlayedResponse = await fetchRecentlyPlayed();
      if (recentlyPlayedResponse.ok) {
        const recentlyPlayed = await recentlyPlayedResponse.json();
        if (recentlyPlayed.items && recentlyPlayed.items.length > 0) {
          const lastTrack = recentlyPlayed.items[0].track;
          const payload: SpotifyNowPlaying = {
            artist: lastTrack.artists[0].name,
            isPlaying: false,
            title: lastTrack.name,
          };
          
          // Store as last played track
          lastPlayedTrack = payload;
          
          nowPlayingCache = {
            payload,
            expires_at: Date.now() + NOW_PLAYING_TTL,
          };
          
          return payload;
        }
      }
    } catch (error) {
      // If recently played fails, use cached last played if available
      if (lastPlayedTrack) {
        return { ...lastPlayedTrack, isPlaying: false };
      }
    }
    
    // If no recently played and no cached track, return false
    nowPlayingCache = {
      payload: false,
      expires_at: Date.now() + NOW_PLAYING_TTL,
    };
    return false;
  }

  if (response.status > 400) {
    // On error, try to return last played track if available
    if (lastPlayedTrack) {
      return { ...lastPlayedTrack, isPlaying: false };
    }
    nowPlayingCache = {
      payload: false,
      expires_at: Date.now() + NOW_PLAYING_TTL,
    };
    return false;
  }

  const song = await response.json();
  const artist = song.item.artists[0].name;
  const isPlaying = song.is_playing;
  const title = song.item.name;

  const payload: SpotifyNowPlaying = {
    artist,
    isPlaying,
    title,
  };

  // Update last played track when we have a valid track
  lastPlayedTrack = payload;

  nowPlayingCache = {
    payload,
    expires_at: Date.now() + NOW_PLAYING_TTL,
  };

  return payload;
}

export default async function getNowPlayingItem(
  options?: GetNowPlayingOptions,
) {
  return getNowPlaying(options);
}
