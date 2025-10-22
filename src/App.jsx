import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Heart, Plus, Volume2, Music, X, List, Share2 } from 'lucide-react';

const SpotifyNowPlaying = () => {
  const [token, setToken] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [device, setDevice] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [volume, setVolume] = useState(50);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [discoverWeeklyUri, setDiscoverWeeklyUri] = useState(null);

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

  // PKCE helpers
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
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
        });
    } else if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // Fetch current track
  useEffect(() => {
    if (!token) return;

    const fetchCurrent = async () => {
      try {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 204) {
          setCurrentTrack(null);
          return;
        }

        const data = await response.json();
        if (data?.item) {
          setCurrentTrack(data.item);
          setIsPlaying(data.is_playing);
          setDevice(data.device);
          setVolume(data.device?.volume_percent || 50);
          setProgress(data.progress_ms || 0);
          setDuration(data.item.duration_ms || 0);
          
          const likedRes = await fetch(
            `https://api.spotify.com/v1/me/tracks/contains?ids=${data.item.id}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          const [liked] = await likedRes.json();
          setIsLiked(liked);
        }
      } catch (error) {
        console.error('Playback error:', error);
      }
    };

    fetchCurrent();
    const interval = setInterval(fetchCurrent, 2000);
    return () => clearInterval(interval);
  }, [token]);

  // Fetch playlists and Discover Weekly
  useEffect(() => {
    if (!token) return;
    
    // Fetch user playlists
    fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const items = data.items || [];
        setPlaylists(items);
        
        // Find Discover Weekly - look for playlist with "discover" and "weekly" in name
        const dw = items.find(p => {
          const name = p.name.toLowerCase();
          return name.includes('discover') && name.includes('weekly');
        });
        
        if (dw) {
          setDiscoverWeeklyUri(dw.uri);
          console.log('Found playlist:', dw.name, dw.uri);
        } else {
          console.log('No Discover Weekly playlist found');
        }
      });
  }, [token]);

  // Search as you type
  useEffect(() => {
    if (searchQuery.length > 1) {
      const timer = setTimeout(async () => {
        try {
          const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=8`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          const data = await response.json();
          setSearchResults(data.tracks?.items || []);
        } catch (error) {
          console.error('Search error:', error);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, token]);

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

  const control = async (endpoint, method = 'PUT', body = null) => {
    try {
      await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null
      });
    } catch (error) {
      console.error('Control error:', error);
    }
  };

  const togglePlay = () => control(isPlaying ? 'pause' : 'play');
  const skipNext = () => control('next', 'POST');
  const skipPrevious = () => control('previous', 'POST');
  
  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPos = Math.floor(percent * duration);
    setProgress(newPos);
    control(`seek?position_ms=${newPos}`, 'PUT');
  };

  const skipForward = () => {
    const newPos = Math.min(progress + 15000, duration);
    setProgress(newPos);
    control(`seek?position_ms=${newPos}`, 'PUT');
  };

  const skipBackward = () => {
    const newPos = Math.max(progress - 15000, 0);
    setProgress(newPos);
    control(`seek?position_ms=${newPos}`, 'PUT');
  };

  const handleVolume = (e) => {
    const newVol = parseInt(e.target.value);
    setVolume(newVol);
    control(`volume?volume_percent=${newVol}`, 'PUT');
  };

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
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [currentTrack.uri] })
    });
    setShowAddToPlaylist(false);
    alert('Added to playlist!');
  };

  const playTrack = async (uri) => {
    await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] })
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const playPlaylist = async (uri) => {
    await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_uri: uri })
    });
    setShowPlaylistMenu(false);
  };

  const shareTrack = () => {
    if (!currentTrack) return;
    const url = currentTrack.external_urls?.spotify || `https://open.spotify.com/track/${currentTrack.id}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const formatTime = (ms) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    return `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900">
        <div className="text-center">
          <Music className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h1 className="text-2xl font-bold text-white mb-3">Now Playing Widget</h1>
          <p className="text-gray-400 mb-6 text-sm">Control your Spotify playback</p>
          <button onClick={handleLogin} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-full transition">
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
        {/* Search + Browse */}
        <div className="mb-4">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a song..."
              className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
              className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition flex items-center gap-2"
              title="Browse Playlists"
            >
              <List className="w-4 h-4" />
            </button>
            {discoverWeeklyUri && (
              <button
                onClick={() => playPlaylist(discoverWeeklyUri)}
                className="bg-green-600 hover:bg-green-700 p-2 rounded-lg transition"
                title="Play Discover Weekly"
              >
                <Play className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-2 mb-2 max-h-60 overflow-y-auto">
              {searchResults.map((track) => (
                <button
                  key={track.id}
                  onClick={() => playTrack(track.uri)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-gray-700 rounded transition"
                >
                  <img src={track.album.images[2]?.url} alt="" className="w-10 h-10 rounded" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{track.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {track.artists.map(a => a.name).join(', ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Playlist Menu */}
          {showPlaylistMenu && (
            <div className="bg-gray-800 rounded-lg p-3 mb-2 max-h-60 overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-gray-400 font-semibold">PLAY PLAYLIST</p>
                <button onClick={() => setShowPlaylistMenu(false)} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => playPlaylist(playlist.uri)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-gray-700 rounded text-sm transition"
                >
                  <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center text-xs">
                    {playlist.images?.[0]?.url ? (
                      <img src={playlist.images[0].url} alt="" className="w-8 h-8 rounded" />
                    ) : '♪'}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="truncate">{playlist.name}</p>
                    <p className="text-xs text-gray-400">{playlist.tracks.total} tracks</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Now Playing Card */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl">
          <div className="relative mb-4">
            <img src={currentTrack.album.images[0]?.url} alt="" className="w-full aspect-square rounded-lg" />
            {device && (
              <div className="absolute top-2 right-2 bg-black bg-opacity-70 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                {device.name}
              </div>
            )}
          </div>

          <div className="mb-4">
            <h2 className="text-xl font-bold mb-1 truncate">{currentTrack.name}</h2>
            <p className="text-gray-400 text-sm truncate">
              {currentTrack.artists.map(a => a.name).join(', ')}
            </p>
          </div>

          {/* Progress */}
          <div className="mb-4">
            <div onClick={handleSeek} className="bg-gray-700 h-1 rounded-full cursor-pointer hover:h-1.5 transition-all">
              <div className="bg-green-500 h-full" style={{ width: `${(progress / duration) * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Skip buttons */}
          <div className="flex justify-center gap-2 mb-4">
            <button onClick={skipBackward} className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded-full">-15s</button>
            <button onClick={skipForward} className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded-full">+15s</button>
          </div>

          {/* Main Controls */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={skipPrevious} className="text-gray-400 hover:text-white p-2">
              <SkipBack className="w-7 h-7" />
            </button>
            <button onClick={togglePlay} className="bg-white text-black rounded-full p-4 hover:scale-105 transition">
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
            </button>
            <button onClick={skipNext} className="text-gray-400 hover:text-white p-2">
              <SkipForward className="w-7 h-7" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-3 mb-4">
            <button onClick={toggleLike} className={`p-2 rounded-full ${isLiked ? 'text-green-500' : 'text-gray-400 hover:text-white'}`} title="Like">
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
            </button>
            <button onClick={() => setShowAddToPlaylist(!showAddToPlaylist)} className="p-2 rounded-full text-gray-400 hover:text-white" title="Add to Playlist">
              <Plus className="w-6 h-6" />
            </button>
            <button onClick={shareTrack} className="p-2 rounded-full text-gray-400 hover:text-white" title="Share">
              <Share2 className="w-6 h-6" />
            </button>
          </div>

          {/* Add to Playlist */}
          {showAddToPlaylist && (
            <div className="bg-gray-800 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto">
              <div className="flex justify-between mb-2">
                <p className="text-xs text-gray-400">Add to playlist:</p>
                <button onClick={() => setShowAddToPlaylist(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              {playlists.map((p) => (
                <button key={p.id} onClick={() => addToPlaylist(p.id)} className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded text-sm">
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Volume */}
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-gray-400" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolume}
              className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #22c55e 0%, #22c55e ${volume}%, #374151 ${volume}%, #374151 100%)` }}
            />
            <span className="text-xs text-gray-400 w-8 text-right">{volume}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotifyNowPlaying;
