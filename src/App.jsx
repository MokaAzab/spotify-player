import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Search, Music } from 'lucide-react';

const SpotifyPlayer = () => {
  const [token, setToken] = useState(null);
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(50);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [isInIframe, setIsInIframe] = useState(false);
  const intervalRef = useRef(null);

  // Check if running in iframe
  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

  // Configuration - Replace with your Spotify credentials
  const CLIENT_ID = '8e9e53c5e52f4af0bd5a946e85736742';
  const REDIRECT_URI = window.location.origin + '/callback';
  const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');

  // PKCE helper functions
  const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
  };

  const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
  };

  const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  // Get auth token from URL or localStorage
  useEffect(() => {
    // Listen for messages from popup window (for iframe auth)
    const handleMessage = (event) => {
      if (event.data.type === 'spotify_auth' && event.data.token) {
        localStorage.setItem('spotify_token', event.data.token);
        setToken(event.data.token);
      }
    };
    
    window.addEventListener('message', handleMessage);

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    let storedToken = localStorage.getItem('spotify_token');

    if (code && !storedToken) {
      // Exchange code for token
      const codeVerifier = localStorage.getItem('code_verifier');
      
      fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }),
      })
        .then(response => response.json())
        .then(data => {
          if (data.access_token) {
            localStorage.setItem('spotify_token', data.access_token);
            localStorage.removeItem('code_verifier');
            setToken(data.access_token);
            
            // If opened as popup, send token to parent
            if (window.opener) {
              window.opener.postMessage({
                type: 'spotify_auth',
                token: data.access_token
              }, '*');
              window.close();
            } else {
              window.history.replaceState({}, document.title, '/');
            }
          }
        })
        .catch(error => console.error('Token exchange error:', error));
    } else if (storedToken) {
      setToken(storedToken);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Initialize Spotify Web Playback SDK
  useEffect(() => {
    if (!token) return;

    // Fetch user profile
    fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => response.json())
      .then(data => setUserProfile(data))
      .catch(error => console.error('Profile fetch error:', error));

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const spotifyPlayer = new window.Spotify.Player({
        name: 'Coda Spotify Player',
        getOAuthToken: cb => { cb(token); },
        volume: volume / 100
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID', device_id);
        setDeviceId(device_id);
      });

      spotifyPlayer.addListener('player_state_changed', state => {
        if (!state) return;
        
        setCurrentTrack(state.track_window.current_track);
        setIsPlaying(!state.paused);
        setPosition(state.position);
        setDuration(state.duration);
      });

      spotifyPlayer.connect();
      setPlayer(spotifyPlayer);
    };

    return () => {
      if (player) {
        player.disconnect();
      }
    };
  }, [token]);

  // Position tracking
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setPosition(prev => Math.min(prev + 1000, duration));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, duration]);

  const handleLogin = async () => {
    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    localStorage.setItem('code_verifier', codeVerifier);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', codeChallenge);

    // If in iframe, open popup window
    if (isInIframe) {
      const width = 500;
      const height = 700;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;
      
      window.open(
        authUrl.toString(),
        'Spotify Login',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } else {
      window.location.href = authUrl.toString();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('spotify_token');
    setToken(null);
    setPlayer(null);
    setCurrentTrack(null);
  };

  const togglePlay = () => {
    if (player) {
      player.togglePlay();
    }
  };

  const skipNext = () => {
    if (player) {
      player.nextTrack();
    }
  };

  const skipPrevious = () => {
    if (player) {
      player.previousTrack();
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    if (player) {
      player.setVolume(newVolume / 100);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = Math.floor(percent * duration);
    setPosition(newPosition);
    if (player) {
      player.seek(newPosition);
    }
  };

  const searchSpotify = async () => {
    if (!searchQuery || !token) return;

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      setSearchResults(data.tracks?.items || []);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const playTrack = async (uri) => {
    if (!deviceId || !token) return;

    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [uri]
        })
      });
    } catch (error) {
      console.error('Play error:', error);
    }
  };

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900">
        <div className="text-center">
          <Music className="w-24 h-24 mx-auto mb-6 text-green-500" />
          <h1 className="text-4xl font-bold text-white mb-4">Spotify Web Player</h1>
          <p className="text-gray-400 mb-8">Connect your Spotify Premium account to start playing</p>
          <button
            onClick={handleLogin}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-full transition"
          >
            Connect Spotify
          </button>
          <p className="text-gray-500 text-sm mt-4">Requires Spotify Premium</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header with Profile */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Spotify Player</h1>
          <div className="flex items-center gap-3">
            {userProfile && (
              <div className="flex items-center gap-2">
                {userProfile.images && userProfile.images[0] && (
                  <img 
                    src={userProfile.images[0].url} 
                    alt={userProfile.display_name}
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <span className="text-sm font-medium">{userProfile.display_name}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchSpotify()}
              placeholder="Search for songs..."
              className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={searchSpotify}
              className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded-lg transition"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto">
              {searchResults.map((track) => (
                <div
                  key={track.id}
                  onClick={() => playTrack(track.uri)}
                  className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded cursor-pointer transition"
                >
                  <img
                    src={track.album.images[2]?.url}
                    alt={track.name}
                    className="w-12 h-12 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{track.name}</p>
                    <p className="text-sm text-gray-400 truncate">
                      {track.artists.map(a => a.name).join(', ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Now Playing */}
        {currentTrack && (
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg p-6">
            <div className="flex items-center gap-6 mb-6">
              <img
                src={currentTrack.album.images[0]?.url}
                alt={currentTrack.name}
                className="w-32 h-32 rounded-lg shadow-lg"
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold mb-2 truncate">{currentTrack.name}</h2>
                <p className="text-gray-400 text-lg truncate">
                  {currentTrack.artists.map(a => a.name).join(', ')}
                </p>
                <p className="text-gray-500 text-sm mt-1">{currentTrack.album.name}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div
                onClick={handleSeek}
                className="bg-gray-700 h-2 rounded-full cursor-pointer"
              >
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${(position / duration) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{formatTime(position)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 mb-6">
              <button
                onClick={skipPrevious}
                className="text-gray-400 hover:text-white transition"
              >
                <SkipBack className="w-8 h-8" />
              </button>
              <button
                onClick={togglePlay}
                className="bg-white text-black rounded-full p-4 hover:scale-110 transition"
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>
              <button
                onClick={skipNext}
                className="text-gray-400 hover:text-white transition"
              >
                <SkipForward className="w-8 h-8" />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-gray-400" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #22c55e 0%, #22c55e ${volume}%, #374151 ${volume}%, #374151 100%)`
                }}
              />
              <span className="text-sm text-gray-400 w-12 text-right">{volume}%</span>
            </div>
          </div>
        )}

        {!currentTrack && deviceId && (
          <div className="text-center py-16 text-gray-500">
            <Music className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Search and play a song to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpotifyPlayer;
