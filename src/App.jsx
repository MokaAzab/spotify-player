import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Heart, Plus, Volume2, Music } from 'lucide-react';

const SpotifyNowPlaying = () => {
  const [token, setToken] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [device, setDevice] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [volume, setVolume] = useState(50);
  const [playlists, setPlaylists] = useState([]);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const CLIENT_ID = '8e9e53c5e52f4af0bd5a946e85736742';
  const REDIRECT_URI = window.location.origin + '/callback';
  const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-library-read',
    'user-library-modify',
    'playlist-read-private',
    'playlist-modify-public',
    'playlist-modify-private'
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

  // Authentication
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    let storedToken = localStorage.getItem('spotify_token');

    if (code && !storedToken) {
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
            window.history.replaceState({}, document.title, '/');
          }
        })
        .catch(error => console.error('Token exchange error:', error));
    } else if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // Fetch currently playing track
  useEffect(() => {
    if (!token) return;

    const fetchCurrentTrack = async () => {
      try {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 204) {
          setCurrentTrack(null);
          return;
        }

        const data = await response.json();
        if (data && data.item) {
          setCurrentTrack(data.item);
          setIsPlaying(data.is_playing);
          setDevice(data.device);
          setVolume(data.device?.volume_percent || 50);
          setProgress(data.progress_ms || 0);
          setDuration(data.item.duration_ms || 0);
          
          // Check if track is liked
          const likedResponse = await fetch(
            `https://api.spotify.com/v1/me/tracks/contains?ids=${data.item.id}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          const [liked] = await likedResponse.json();
          setIsLiked(liked);
        }
      } catch (error) {
        console.error('Error fetching playback:', error);
      }
    };

    fetchCurrentTrack();
    const interval = setInterval(fetchCurrentTrack, 2000);
    return () => clearInterval(interval);
  }, [token]);

  // Fetch playlists
  useEffect(() => {
    if (!token) return;

    fetch('https://api.spotify.com/v1/me/playlists?limit=20', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setPlaylists(data.items || []))
      .catch(error => console.error('Error fetching playlists:', error));
  }, [token]);

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

    window.location.href = authUrl.toString();
  };

  const spotifyControl = async (endpoint, method = 'PUT', body = null) => {
    try {
      await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : null
      });
    } catch (error) {
      console.error('Control error:', error);
    }
  };

  const togglePlayPause = () => {
    spotifyControl(isPlaying ? 'pause' : 'play');
  };

  const skipNext = () => spotifyControl('next', 'POST');
  const skipPrevious = () => spotifyControl('previous', 'POST');

  const toggleLike = async () => {
    if (!currentTrack) return;
    
    const method = isLiked ? 'DELETE' : 'PUT';
    await fetch(`https://api.spotify.com/v1/me/tracks?ids=${currentTrack.id}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}` }
    });
    setIsLiked(!isLiked);
  };

  const addToPlaylist = async (playlistId) => {
    if (!currentTrack) return;
    
    await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [currentTrack.uri]
      })
    });
    setShowPlaylists(false);
    alert('Added to playlist!');
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    spotifyControl(`volume?volume_percent=${newVolume}`, 'PUT');
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = Math.floor(percent * duration);
    setProgress(newPosition);
    spotifyControl(`seek?position_ms=${newPosition}`, 'PUT');
  };

  const skipForward = () => {
    const newPosition = Math.min(progress + 15000, duration);
    setProgress(newPosition);
    spotifyControl(`seek?position_ms=${newPosition}`, 'PUT');
  };

  const skipBackward = () => {
    const newPosition = Math.max(progress - 15000, 0);
    setProgress(newPosition);
    spotifyControl(`seek?position_ms=${newPosition}`, 'PUT');
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
          <Music className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h1 className="text-2xl font-bold text-white mb-3">Now Playing Widget</h1>
          <p className="text-gray-400 mb-6 text-sm">Control your Spotify playback</p>
          <button
            onClick={handleLogin}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-full transition"
          >
            Connect Spotify
          </button>
        </div>
      </div>
    );
  }

  if (!currentTrack) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
        <div className="text-center">
          <Music className="w-16 h-16 mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400">No track playing</p>
          <p className="text-gray-500 text-sm mt-2">Start playing on any Spotify device</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Now Playing Card */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl">
          {/* Album Art */}
          <div className="relative mb-4">
            <img
              src={currentTrack.album.images[0]?.url}
              alt={currentTrack.name}
              className="w-full aspect-square rounded-lg shadow-lg"
            />
            {device && (
              <div className="absolute top-2 right-2 bg-black bg-opacity-70 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                {device.name}
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="mb-4">
            <h2 className="text-xl font-bold mb-1 truncate">{currentTrack.name}</h2>
            <p className="text-gray-400 text-sm truncate">
              {currentTrack.artists.map(a => a.name).join(', ')}
            </p>
            <p className="text-gray-500 text-xs mt-1 truncate">{currentTrack.album.name}</p>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div 
              onClick={handleSeek}
              className="bg-gray-700 h-1 rounded-full overflow-hidden cursor-pointer hover:h-1.5 transition-all"
            >
              <div 
                className="bg-green-500 h-full transition-all"
                style={{ width: `${(progress / duration) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Skip Position Controls */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              onClick={skipBackward}
              className="text-gray-400 hover:text-white transition text-xs px-3 py-1 rounded-full bg-gray-800 hover:bg-gray-700"
            >
              -15s
            </button>
            <button
              onClick={skipForward}
              className="text-gray-400 hover:text-white transition text-xs px-3 py-1 rounded-full bg-gray-800 hover:bg-gray-700"
            >
              +15s
            </button>
          </div>

          {/* Main Controls */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={skipPrevious}
              className="text-gray-400 hover:text-white transition p-2"
            >
              <SkipBack className="w-7 h-7" />
            </button>
            
            <button
              onClick={togglePlayPause}
              className="bg-white text-black rounded-full p-4 hover:scale-105 transition shadow-lg"
            >
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
            </button>
            
            <button
              onClick={skipNext}
              className="text-gray-400 hover:text-white transition p-2"
            >
              <SkipForward className="w-7 h-7" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={toggleLike}
              className={`p-2 rounded-full transition ${
                isLiked ? 'text-green-500' : 'text-gray-400 hover:text-white'
              }`}
              title={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
            >
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
            </button>
            
            <button
              onClick={() => setShowPlaylists(!showPlaylists)}
              className="p-2 rounded-full text-gray-400 hover:text-white transition"
              title="Add to Playlist"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          {/* Playlist Selection */}
          {showPlaylists && (
            <div className="bg-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto mb-4">
              <p className="text-xs text-gray-400 mb-2">Add to playlist:</p>
              {playlists.map(playlist => (
                <button
                  key={playlist.id}
                  onClick={() => addToPlaylist(playlist.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded text-sm transition"
                >
                  {playlist.name}
                </button>
              ))}
            </div>
          )}

          {/* Volume Control */}
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-gray-400" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #22c55e 0%, #22c55e ${volume}%, #374151 ${volume}%, #374151 100%)`
              }}
            />
            <span className="text-xs text-gray-400 w-8 text-right">{volume}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotifyNowPlaying;
