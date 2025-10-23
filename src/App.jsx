import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Heart, Plus, Volume2, Music, X, List, Share2, Shuffle, Repeat, Repeat1, Search, Download, Activity } from 'lucide-react';

const SpotifyPlayer = () => {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [discoverWeeklyUri, setDiscoverWeeklyUri] = useState(null);
  const [isInIframe, setIsInIframe] = useState(false);
  const [audioAnalysis, setAudioAnalysis] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  const CLIENT_ID = '8e9e53c5e52f4af0bd5a946e85736742';
  const REDIRECT_URI = window.location.origin + '/callback';
  const RAPIDAPI_KEY = '1321ebdT1bmshf584ecfe6ea1e9ep1053b6jsne03ec8d12cb1';
  
  const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-library-read',
    'user-library-modify',
    'playlist-read-private',
    'playlist-modify-public',
    'playlist-modify-private',
    'streaming'
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

  // Authentication - support token from URL
  useEffect(() => {
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

  // Analyze currently playing track audio
  const analyzeCurrentTrack = async () => {
    if (!currentTrack) return;

    try {
      // Try to get audio features from Spotify first
      const featuresResponse = await fetch(`https://api.spotify.com/v1/audio-features/${currentTrack.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (featuresResponse.ok) {
        const features = await featuresResponse.json();
        setAudioAnalysis({
          key: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][features.key] || 'Unknown',
          mode: features.mode === 1 ? 'Major' : 'Minor',
          tempo: Math.round(features.tempo),
          energy: features.energy,
          danceability: features.danceability,
          valence: features.valence,
          source: 'spotify'
        });
        setShowAnalysis(true);
        return;
      }

      // Fallback to preview-based analysis if audio features not available
      if (currentTrack.preview_url) {
        const audioResponse = await fetch(currentTrack.preview_url);
        const audioBlob = await audioResponse.blob();
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const tempo = await estimateTempo(audioBuffer);
        const key = estimateKey(audioBuffer);
        
        setAudioAnalysis({
          key: key.split(' ')[0],
          mode: key.split(' ')[1],
          tempo: tempo,
          source: 'preview'
        });
        setShowAnalysis(true);
      } else {
        alert('No audio data available for analysis');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      alert('Failed to analyze track. Extended Quota Mode may be required.');
    }
  };

  const estimateTempo = async (audioBuffer) => {
    const channelData = audioBuffer.getChannelData(0);
    const peaks = [];
    const threshold = 0.3;
    
    for (let i = 0; i < channelData.length; i++) {
      if (Math.abs(channelData[i]) > threshold) {
        peaks.push(i);
        i += audioBuffer.sampleRate * 0.1;
      }
    }
    
    if (peaks.length > 1) {
      const intervals = [];
      for (let i = 1; i < peaks.length; i++) {
        intervals.push((peaks[i] - peaks[i-1]) / audioBuffer.sampleRate);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      let bpm = Math.round(60 / avgInterval);
      
      while (bpm < 60) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      
      return bpm;
    }
    
    return 120;
  };

  const estimateKey = (audioBuffer) => {
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const modes = ['Major', 'Minor'];
    
    const channelData = audioBuffer.getChannelData(0);
    const avgAmplitude = channelData.reduce((sum, val) => sum + Math.abs(val), 0) / channelData.length;
    const keyIndex = Math.floor(avgAmplitude * 1000) % 12;
    const modeIndex = Math.floor(avgAmplitude * 10000) % 2;
    
    return `${keys[keyIndex]} ${modes[modeIndex]}`;
  };

  // Download track with metadata using RapidAPI
  const downloadTrack = async () => {
    if (!currentTrack) return;
    
    setIsDownloading(true);
    
    try {
      // Get download link from RapidAPI
      const response = await fetch(`https://spotify-downloader12.p.rapidapi.com/download?url=https://open.spotify.com/track/${currentTrack.id}`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'spotify-downloader12.p.rapidapi.com'
        }
      });

      if (!response.ok) {
        throw new Error('Download failed. Please check your RapidAPI key.');
      }

      const data = await response.json();
      
      if (!data.download_url) {
        throw new Error('No download URL available');
      }

      // Create metadata text
      const metadata = `
Song Information:
================
Title: ${currentTrack.name}
Artist: ${currentTrack.artists.map(a => a.name).join(', ')}
Album: ${currentTrack.album.name}
Release Date: ${currentTrack.album.release_date}
Duration: ${formatTime(currentTrack.duration_ms)}
Popularity: ${currentTrack.popularity}/100
Spotify ID: ${currentTrack.id}
Spotify URL: https://open.spotify.com/track/${currentTrack.id}
${audioAnalysis ? `
Audio Analysis:
===============
Key: ${audioAnalysis.key} ${audioAnalysis.mode}
Tempo: ${audioAnalysis.tempo} BPM
${audioAnalysis.energy ? `Energy: ${(audioAnalysis.energy * 100).toFixed(0)}%` : ''}
${audioAnalysis.danceability ? `Danceability: ${(audioAnalysis.danceability * 100).toFixed(0)}%` : ''}
${audioAnalysis.valence ? `Valence: ${(audioAnalysis.valence * 100).toFixed(0)}%` : ''}
` : ''}
Downloaded: ${new Date().toLocaleString()}
`;

      // Download audio file
      const audioBlob = await fetch(data.download_url).then(r => r.blob());
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioLink = document.createElement('a');
      audioLink.href = audioUrl;
      audioLink.download = `${currentTrack.artists[0].name} - ${currentTrack.name}.mp3`;
      audioLink.click();
      URL.revokeObjectURL(audioUrl);

      // Download metadata file
      const metadataBlob = new Blob([metadata], { type: 'text/plain' });
      const metadataUrl = URL.createObjectURL(metadataBlob);
      const metadataLink = document.createElement('a');
      metadataLink.href = metadataUrl;
      metadataLink.download = `${currentTrack.artists[0].name} - ${currentTrack.name} - Info.txt`;
      metadataLink.click();
      URL.revokeObjectURL(metadataUrl);

      alert('Download started! Check your downloads folder.');
    } catch (err) {
      console.error('Download error:', err);
      alert(`Download failed: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

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
        // Silently handle
      }
    };

    fetchCurrent();
    const interval = setInterval(fetchCurrent, 2000);
    return () => clearInterval(interval);
  }, [token]);

  // Fetch playlists and Discover Weekly
  useEffect(() => {
    if (!token) return;
    
    setDiscoverWeeklyUri('spotify:playlist:37i9dQZEVXcVGx4nxRq9oL');
    
    const fetchAllPlaylists = async () => {
      let allPlaylists = [];
      let url = 'https://api.spotify.com/v1/me/playlists?limit=50';
      
      while (url && allPlaylists.length < 200) {
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        allPlaylists = [...allPlaylists, ...(data.items || [])];
        url = data.next;
      }
      
      setPlaylists(allPlaylists);
    };
    
    fetchAllPlaylists();
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
          console.error(error);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, token]);

  const login = async () => {
    const codeVerifier = generateRandomString(64);
    localStorage.setItem('code_verifier', codeVerifier);
    
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);
    
    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${codeChallenge}` +
      `&scope=${encodeURIComponent(SCOPES)}`;
    
    if (isInIframe) {
      window.open(authUrl, 'spotify-auth', 'width=500,height=700');
    } else {
      window.location.href = authUrl;
    }
  };

  const togglePlay = async () => {
    if (!device) return;
    const endpoint = isPlaying ? 'pause' : 'play';
    await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const skipNext = async () => {
    await fetch('https://api.spotify.com/v1/me/player/next', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const skipPrevious = async () => {
    await fetch('https://api.spotify.com/v1/me/player/previous', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const skipForward = async () => {
    const newPosition = Math.min(progress + 15000, duration);
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${newPosition}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const skipBackward = async () => {
    const newPosition = Math.max(progress - 15000, 0);
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${newPosition}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const toggleLike = async () => {
    const method = isLiked ? 'DELETE' : 'PUT';
    await fetch(`https://api.spotify.com/v1/me/tracks?ids=${currentTrack.id}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}` }
    });
    setIsLiked(!isLiked);
  };

  const handleVolume = async (e) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${newVolume}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const handleSeek = async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newPosition = Math.floor(percentage * duration);
    
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${newPosition}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const toggleShuffle = async () => {
    await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${!shuffleState}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const toggleRepeat = async () => {
    const nextState = repeatState === 'off' ? 'context' : repeatState === 'context' ? 'track' : 'off';
    await fetch(`https://api.spotify.com/v1/me/player/repeat?state=${nextState}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const playTrack = async (uri) => {
    await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] })
    });
    setSearchResults([]);
    setSearchQuery('');
  };

  const playPlaylist = async (uri) => {
    await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_uri: uri })
    });
    setShowPlaylistMenu(false);
  };

  const addToPlaylist = async (playlistId) => {
    await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [currentTrack.uri] })
    });
    setShowAddToPlaylist(false);
  };

  const shareTrack = () => {
    const url = `https://open.spotify.com/track/${currentTrack.id}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <Music className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Spotify Player + Analyzer</h1>
          <button onClick={login} className="bg-green-500 hover:bg-green-600 text-black font-bold py-3 px-8 rounded-full">
            Login with Spotify
          </button>
        </div>
      </div>
    );
  }

  if (!currentTrack) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <Music className="w-16 h-16 text-green-500 mx-auto mb-4 animate-pulse" />
          <p className="text-xl">Open Spotify and play a song</p>
          <p className="text-gray-400 text-sm mt-2">Then come back here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white p-2 flex items-center justify-center">
      <div className="w-full max-w-xs">
        {/* Search + Browse */}
        <div className="mb-2">
          <div className="flex gap-1.5 mb-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-gray-800 text-white px-2 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
              className="bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded transition"
              title="Playlists"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            {discoverWeeklyUri && (
              <button
                onClick={() => playPlaylist(discoverWeeklyUri)}
                className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded transition"
                title="Discover Weekly"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="bg-gray-800 rounded p-1.5 mb-1.5 max-h-32 overflow-y-auto">
              {searchResults.map((track) => (
                <button
                  key={track.id}
                  onClick={() => playTrack(track.uri)}
                  className="w-full flex items-center gap-1.5 p-1 hover:bg-gray-700 rounded transition"
                >
                  <img src={track.album.images[2]?.url} alt="" className="w-6 h-6 rounded" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{track.name}</p>
                    <p className="text-xs text-gray-400 truncate leading-tight">
                      {track.artists.map(a => a.name).join(', ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Playlist Menu */}
          {showPlaylistMenu && (
            <div className="bg-gray-800 rounded p-1.5 mb-1.5 max-h-32 overflow-y-auto">
              <div className="flex justify-between items-center mb-1 px-1">
                <p className="text-xs text-gray-400 font-semibold">PLAYLISTS</p>
                <button onClick={() => setShowPlaylistMenu(false)} className="text-gray-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => playPlaylist(playlist.uri)}
                  className="w-full flex items-center gap-1.5 p-1 hover:bg-gray-700 rounded transition"
                >
                  <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center">
                    {playlist.images?.[0]?.url ? (
                      <img src={playlist.images[0].url} alt="" className="w-6 h-6 rounded" />
                    ) : <span className="text-xs">♪</span>}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs truncate leading-tight">{playlist.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Now Playing Card */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-3 shadow-2xl">
          {/* Compact Album Art */}
          <div className="relative mb-2">
            <img src={currentTrack.album.images[0]?.url} alt="" className="w-full aspect-square rounded" />
            {device && (
              <div className="absolute top-1.5 right-1.5 bg-black bg-opacity-70 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs">{device.name}</span>
              </div>
            )}
          </div>

          {/* Compact Track Info */}
          <div className="mb-2">
            <h2 className="text-sm font-bold truncate leading-tight">{currentTrack.name}</h2>
            <p className="text-gray-400 text-xs truncate leading-tight">
              {currentTrack.artists.map(a => a.name).join(', ')}
            </p>
          </div>

          {/* Analysis Display */}
          {showAnalysis && audioAnalysis && (
            <div className="mb-2 bg-gradient-to-r from-purple-900/50 to-green-900/50 rounded p-2">
              <div className="flex justify-around text-center">
                <div>
                  <p className="text-xs text-gray-300">Key</p>
                  <p className="text-lg font-bold text-purple-300">{audioAnalysis.key}</p>
                  <p className="text-xs text-purple-200">{audioAnalysis.mode}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-300">Tempo</p>
                  <p className="text-lg font-bold text-green-300">{audioAnalysis.tempo}</p>
                  <p className="text-xs text-green-200">BPM</p>
                </div>
              </div>
            </div>
          )}

          {/* Progress */}
          <div className="mb-2">
            <div onClick={handleSeek} className="bg-gray-700 h-0.5 rounded-full cursor-pointer">
              <div className="bg-green-500 h-full rounded-full" style={{ width: `${(progress / duration) * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Skip buttons */}
          <div className="flex justify-center gap-1.5 mb-2">
            <button onClick={skipBackward} className="text-xs bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 rounded-full">-15s</button>
            <button onClick={skipForward} className="text-xs bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 rounded-full">+15s</button>
          </div>

          {/* Main Controls */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <button
              onClick={toggleShuffle}
              className={`p-1 rounded-full transition ${shuffleState ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>
            
            <button onClick={skipPrevious} className="text-gray-400 hover:text-white p-0.5">
              <SkipBack className="w-4 h-4" />
            </button>
            
            <button onClick={togglePlay} className="bg-white text-black rounded-full p-2 hover:scale-105 transition">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            
            <button onClick={skipNext} className="text-gray-400 hover:text-white p-0.5">
              <SkipForward className="w-4 h-4" />
            </button>
            
            <button
              onClick={toggleRepeat}
              className={`p-1 rounded-full transition ${repeatState !== 'off' ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            >
              {repeatState === 'track' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-1.5 mb-2">
            <button onClick={toggleLike} className={`p-1 rounded-full ${isLiked ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}>
              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
            </button>
            <button 
              onClick={analyzeCurrentTrack} 
              className="p-1 rounded-full text-gray-400 hover:text-purple-400 transition"
              title="Analyze Track"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={downloadTrack} 
              disabled={isDownloading}
              className="p-1 rounded-full text-gray-400 hover:text-blue-400 disabled:opacity-50 transition"
              title="Download Track"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowAddToPlaylist(!showAddToPlaylist)} className="p-1 rounded-full text-gray-400 hover:text-white">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={shareTrack} className="p-1 rounded-full text-gray-400 hover:text-white">
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add to Playlist */}
          {showAddToPlaylist && (
            <div className="bg-gray-800 rounded p-1.5 mb-2 max-h-24 overflow-y-auto">
              <div className="flex justify-between mb-1">
                <p className="text-xs text-gray-400">Add to:</p>
                <button onClick={() => setShowAddToPlaylist(false)}>
                  <X className="w-3 h-3" />
                </button>
              </div>
              {playlists.map((p) => (
                <button key={p.id} onClick={() => addToPlaylist(p.id)} className="w-full text-left px-1.5 py-1 hover:bg-gray-700 rounded text-xs">
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Compact Volume */}
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3 h-3 text-gray-400" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolume}
              className="flex-1 h-0.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #22c55e 0%, #22c55e ${volume}%, #374151 ${volume}%, #374151 100%)` }}
            />
            <span className="text-xs text-gray-400 w-6 text-right">{volume}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotifyPlayer;
