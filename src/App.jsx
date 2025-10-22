import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Heart, Volume2, Music, Shuffle, Repeat, Repeat1, Share2 } from 'lucide-react';

const SpotifyCodaEmbed = () => {
  const [token, setToken] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [device, setDevice] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [volume, setVolume] = useState(50);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffleState, setShuffleState] = useState(false);
  const [repeatState, setRepeatState] = useState('off');
  const [isInIframe, setIsInIframe] = useState(false);

  const CLIENT_ID = '8e9e53c5e52f4af0bd5a946e85736742';
  const REDIRECT_URI = window.location.origin + '/callback';
  const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-library-read',
    'user-library-modify'
  ].join(' ');

  // Check if in iframe
  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

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

  // Listen for auth messages from popup
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'spotify_auth' && event.data.token) {
        localStorage.setItem('spotify_token', event.data.token);
        setToken(event.data.token);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Authentication - support token from URL or localStorage
  useEffect(() => {
    // Check for token in URL first (for iframe use)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    
    if (urlToken) {
      setToken(urlToken);
      localStorage.setItem('spotify_token', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    const code = urlParams.get('code');
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
            
            // Show token for Coda embed
            alert(`✅ Authenticated! For Coda embed, use:\n\n${window.location.origin}?token=${data.access_token}\n\n(Copy this URL)`);
            
            if (window.opener) {
              window.opener.postMessage({
                type: 'spotify_auth',
                token: data.access_token
              }, '*');
            } else {
              window.history.replaceState({}, document.title, '/');
            }
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

        if (response.status === 204 || response.status === 202) {
          setCurrentTrack(null);
          return;
        }

        if (!response.ok) return;

        const data = await response.json();
        if (data?.item) {
          setCurrentTrack(data.item);
          setIsPlaying(data.is_playing);
          setDevice(data.device);
          setVolume(data.device?.volume_percent || 50);
          setProgress(data.progress_ms || 0);
          setDuration(data.item.duration_ms || 0);
          setShuffleState(data.shuffle_state || false);
          setRepeatState(data.repeat_state || 'off');
          
          const likedRes = await fetch(
            `https://api.spotify.com/v1/me/tracks/contains?ids=${data.item.id}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          const [liked] = await likedRes.json();
          setIsLiked(liked);
        }
      } catch (error) {
        // Silently handle errors
      }
    };

    fetchCurrent();
    const interval = setInterval(fetchCurrent, 2000);
    return () => clearInterval(interval);
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

    // If in iframe, open popup
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

  const control = async (endpoint, method = 'PUT', body = null) => {
    try {
      await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null
      });
    } catch (error) {
      // Silently handle
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

  const toggleShuffle = async () => {
    const newState = !shuffleState;
    await control(`shuffle?state=${newState}`, 'PUT');
    setShuffleState(newState);
  };

  const toggleRepeat = async () => {
    const states = ['off', 'context', 'track'];
    const currentIndex = states.indexOf(repeatState);
    const newState = states[(currentIndex + 1) % states.length];
    await control(`repeat?state=${newState}`, 'PUT');
    setRepeatState(newState);
  };

  const shareTrack = () => {
    if (!currentTrack) return;
    const url = currentTrack.external_urls?.spotify || `https://open.spotify.com/track/${currentTrack.id}`;
    navigator.clipboard.writeText(url);
    alert('Link copied!');
  };

  const formatTime = (ms) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    return `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900">
        <div className="text-center p-6">
          <Music className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h1 className="text-2xl font-bold text-white mb-3">Spotify Player</h1>
          <p className="text-gray-400 mb-6 text-sm">
            {isInIframe ? 'Click below to authenticate (popup window)' : 'Connect your Spotify account'}
          </p>
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
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl">
          {/* Album Art */}
          <div className="relative mb-4">
            <img src={currentTrack.album.images[0]?.url} alt="" className="w-full aspect-square rounded-lg" />
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

          {/* Main Controls */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={toggleShuffle}
              className={`p-2 rounded-full transition ${shuffleState ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            >
              <Shuffle className="w-5 h-5" />
            </button>
            
            <button onClick={skipPrevious} className="text-gray-400 hover:text-white p-2">
              <SkipBack className="w-6 h-6" />
            </button>
            
            <button onClick={togglePlay} className="bg-white text-black rounded-full p-3 hover:scale-105 transition">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>
            
            <button onClick={skipNext} className="text-gray-400 hover:text-white p-2">
              <SkipForward className="w-6 h-6" />
            </button>
            
            <button
              onClick={toggleRepeat}
              className={`p-2 rounded-full transition ${repeatState !== 'off' ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            >
              {repeatState === 'track' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-3 mb-4">
            <button onClick={toggleLike} className={`p-2 rounded-full ${isLiked ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}>
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            </button>
            <button onClick={shareTrack} className="p-2 rounded-full text-gray-400 hover:text-white">
              <Share2 className="w-5 h-5" />
            </button>
          </div>

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

export default SpotifyCodaEmbed;
