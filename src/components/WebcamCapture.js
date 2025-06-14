import React, { useRef, useCallback, useEffect, useState } from 'react';
import Webcam from 'react-webcam';

const WebcamCapture = () => {
  const webcamRef = useRef(null);
  const audioRef = useRef(null);
  const [currentChar, setCurrentChar] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [sentence, setSentence] = useState([]);
  const [lastCharTime, setLastCharTime] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [processingTime, setProcessingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioText, setAudioText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('checking');

  const CHAR_DELAY = 1.5; // Matches backend's char_delay
  const INITIAL_DELAY = 2; // Matches backend's initial_delay
  // Updated API URL untuk production
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-mechinelearning-pi.onrender.com';

  // Check API connection on component mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
          setError('Backend server is not responding');
        }
      } catch (err) {
        setConnectionStatus('error');
        setError('Failed to connect to backend server: ' + err.message);
      }
    };

    checkConnection();
  }, []);

  const captureAndSend = useCallback(async () => {
    if (!cameraEnabled || !webcamRef.current || isProcessing || connectionStatus !== 'connected') {
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setIsProcessing(true);
    
    try {
      const payload = {
        image: imageSrc,
        sentence,
        last_char_time: lastCharTime,
        char_delay: CHAR_DELAY,
        initial_delay: INITIAL_DELAY,
        camera_state: cameraEnabled,
      };

      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();

      if (result) {
        setCurrentChar(result.prediction || '');
        setSentence(result.sentence || []);
        setLastCharTime(result.last_char_time);
        setProcessingTime(result.processing_time || 0);
        setCameraEnabled(result.camera_state);
        setError('');

        // Handle automatic speech from backend
        if (result.should_speak && result.audio_url) {
          setIsSpeaking(true);
          setAudioText(result.audio_text);
          
          // Play audio from backend
          if (audioRef.current) {
            audioRef.current.src = `${API_BASE_URL}${result.audio_url}`;
            audioRef.current.play()
              .then(() => {
                console.log('Audio playing successfully');
              })
              .catch((err) => {
                console.error('Error playing audio:', err);
                setError('Failed to play audio: ' + err.message);
                setIsSpeaking(false);
              });
          }
        }

        // Respect backend's should_continue flag for rate limiting
        if (!result.should_continue) {
          // Slow down requests if backend is overloaded
          setTimeout(() => setIsProcessing(false), 500);
          return;
        }
      }
    } catch (err) {
      setError('Prediction error: ' + err.message);
      // Reconnection logic for production
      if (err.message.includes('fetch')) {
        setConnectionStatus('error');
        setTimeout(() => {
          setConnectionStatus('checking');
          // Retry connection check
          fetch(`${API_BASE_URL}/health`)
            .then(response => {
              if (response.ok) {
                setConnectionStatus('connected');
                setError('');
              }
            })
            .catch(() => {
              setConnectionStatus('error');
            });
        }, 5000);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [cameraEnabled, sentence, lastCharTime, isProcessing, connectionStatus]);

  const toggleCamera = async () => {
    if (connectionStatus !== 'connected') {
      setError('Cannot toggle camera: backend not connected');
      return;
    }

    try {
      const newState = !cameraEnabled;
      const response = await fetch(`${API_BASE_URL}/camera`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enable: newState }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setCameraEnabled(data.camera_state);
        setError('');
        
        // Reset state when camera is turned off
        if (!newState) {
          setCurrentChar('');
          setSentence([]);
          setLastCharTime(0);
          setIsSpeaking(false);
          setAudioText('');
        }
      }
    } catch (err) {
      setError('Failed to toggle camera: ' + err.message);
    }
  };

  const clearSentence = async () => {
    if (connectionStatus !== 'connected') {
      setError('Cannot clear sentence: backend not connected');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSentence(data.sentence || []);
      setLastCharTime(data.last_char_time || 0);
      setCurrentChar('');
      setError('');
      setIsSpeaking(false);
      setAudioText('');
    } catch (err) {
      setError('Clear error: ' + err.message);
    }
  };

  const manualSpeak = () => {
    const text = sentence.join('').trim();
    if (!text || isSpeaking) return;

    setIsSpeaking(true);
    setAudioText(text);
    
    // Use browser's built-in speech synthesis as fallback
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID'; // Indonesian language
      utterance.rate = 0.8;
      utterance.pitch = 1;
      
      utterance.onend = () => {
        setIsSpeaking(false);
        setAudioText('');
      };
      
      utterance.onerror = () => {
        setIsSpeaking(false);
        setAudioText('');
        setError('Speech synthesis failed');
      };
      
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      setIsSpeaking(false);
      setAudioText('');
      setError('Speech error: ' + err.message);
    }
  };

  const formatCurrentChar = (char) => {
    if (!char) return '';
    if (char.toLowerCase() === 'space') return 'SPASI';
    if (char.toLowerCase() === 'enter') return 'ENTER';
    return char.toString().toUpperCase();
  };

  // Handle audio end event
  const handleAudioEnd = () => {
    setIsSpeaking(false);
    setAudioText('');
  };

  const handleAudioError = (err) => {
    console.error('Audio error:', err);
    setIsSpeaking(false);
    setAudioText('');
    setError('Audio playback failed');
  };

  // Capture frames at regular intervals when camera is enabled
  useEffect(() => {
    if (!cameraEnabled || connectionStatus !== 'connected') return;
    
    const interval = setInterval(() => {
      captureAndSend();
    }, 300); // Slightly slower for production stability

    return () => clearInterval(interval);
  }, [captureAndSend, cameraEnabled, connectionStatus]);

  // Get performance stats
  const getStats = async () => {
    if (connectionStatus !== 'connected') {
      setError('Cannot get stats: backend not connected');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/stats`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Performance Stats:', data);
      alert(`Performance Stats:\nAvg Processing Time: ${data.avg_processing_time}ms\nTotal Requests: ${data.total_requests}\nUptime: ${data.uptime}s`);
    } catch (err) {
      console.error('Failed to get stats:', err);
      setError('Failed to get performance stats');
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'checking': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return '🟢 Connected';
      case 'checking': return '🟡 Connecting...';
      case 'error': return '🔴 Disconnected';
      default: return '⚪ Unknown';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-5">
      {/* Hidden audio element for playing backend-generated audio */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnd}
        onError={handleAudioError}
        preload="none"
        style={{ display: 'none' }}
      />

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300">
          <div className="flex justify-between items-center">
            <span>{error}</span>
            <button 
              onClick={() => setError('')}
              className="text-red-500 hover:text-red-700 font-bold"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">
          Pengenalan Bahasa Isyarat
        </h1>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            <div className={`font-medium ${getConnectionStatusColor()}`}>
              {getConnectionStatusText()}
            </div>
            <div>Processing: {(processingTime * 1000).toFixed(0)}ms</div>
            <div>Chars: {sentence.length}</div>
          </div>
          <button
            onClick={toggleCamera}
            disabled={isProcessing || connectionStatus !== 'connected'}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              cameraEnabled 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            } ${(isProcessing || connectionStatus !== 'connected') ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {cameraEnabled ? 'Matikan Kamera' : 'Nyalakan Kamera'}
          </button>
          <button
            onClick={getStats}
            disabled={connectionStatus !== 'connected'}
            className={`px-3 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 ${
              connectionStatus !== 'connected' ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Stats
          </button>
        </div>
      </div>

      {connectionStatus === 'error' && (
        <div className="mb-4 p-4 bg-yellow-100 border border-yellow-300 rounded-lg">
          <div className="text-yellow-700">
            <h3 className="font-bold">Backend Connection Issue</h3>
            <p>Unable to connect to the backend server. Please check:</p>
            <ul className="mt-2 list-disc list-inside text-sm">
              <li>Backend server is running at: {API_BASE_URL}</li>
              <li>Your internet connection</li>
              <li>CORS settings on the backend</li>
            </ul>
            <p className="mt-2 text-sm">The system will automatically retry connection...</p>
          </div>
        </div>
      )}

      {cameraEnabled && (
        <div className="mb-4 border-2 border-gray-300 rounded-lg overflow-hidden relative">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ 
              width: 640, 
              height: 480, 
              facingMode: 'user' 
            }}
            className="w-full"
            mirrored={true}
          />
          {isProcessing && (
            <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded text-sm">
              Processing...
            </div>
          )}
          {isSpeaking && (
            <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-sm flex items-center space-x-2">
              <span>Speaking...</span>
              {audioText && (
                <span className="text-xs bg-green-600 px-1 rounded">
                  "{audioText.substring(0, 20)}{audioText.length > 20 ? '...' : ''}"
                </span>
              )}
            </div>
          )}
          {connectionStatus === 'connected' && (
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
              🟢 Online
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-center text-gray-700">
            Karakter Terdeteksi
          </h2>
          <div className="text-6xl font-bold text-center py-8 text-blue-600 min-h-[120px] flex items-center justify-center">
            {formatCurrentChar(currentChar) || (
              <span className="text-gray-400 text-4xl">-</span>
            )}
          </div>
          <div className="text-center text-sm text-gray-600 mt-2">
            {currentChar && `Detected: ${currentChar}`}
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-center text-gray-700">
            Kontrol
          </h2>
          <div className="flex flex-col space-y-4 mt-6">
            <button
              onClick={manualSpeak}
              disabled={isSpeaking || sentence.length === 0}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                isSpeaking || sentence.length === 0
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-green-500 hover:bg-green-600 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {isSpeaking ? 'Sedang Berbicara...' : 'Ucapkan Kalimat (Manual)'}
            </button>
            <button
              onClick={clearSentence}
              disabled={sentence.length === 0 || connectionStatus !== 'connected'}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                sentence.length === 0 || connectionStatus !== 'connected'
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg'
              }`}
            >
              Hapus Kalimat
            </button>
          </div>
          <div className="mt-4 text-sm text-gray-600 text-center">
            Status: {cameraEnabled ? 'Aktif' : 'Nonaktif'}
            {isSpeaking && <div className="text-green-600 font-medium">🔊 Audio Playing</div>}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-gradient-to-r from-gray-50 to-gray-100 p-6 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-700">Kalimat Terbentuk</h2>
          <div className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full">
            {sentence.length} karakter
          </div>
        </div>
        <div className="min-h-24 p-4 bg-white rounded-lg border border-gray-200 shadow-inner">
          {sentence.length > 0 ? (
            <p className="text-xl break-words leading-relaxed">
              {sentence.join('')}
            </p>
          ) : (
            <p className="text-gray-400 italic text-center py-4">
              Belum ada teks terdeteksi. Mulai dengan menyalakan kamera...
            </p>
          )}
        </div>
        {isSpeaking && audioText && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm text-green-700 font-medium">
              🎵 Sedang memutar audio: "{audioText}"
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 bg-blue-50 p-5 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-3">Petunjuk Penggunaan:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ul className="list-disc pl-5 text-blue-700 space-y-2">
            <li>Pastikan koneksi internet stabil</li>
            <li>Nyalakan kamera untuk memulai deteksi</li>
            <li>Tunjukkan gestur tangan yang sesuai ke kamera</li>
            <li>Sistem akan mendeteksi huruf secara otomatis</li>
            <li>Tunggu jeda 1.5 detik antar karakter</li>
          </ul>
          <ul className="list-disc pl-5 text-blue-700 space-y-2">
            <li><strong>Gestur Khusus:</strong></li>
            <li>• Fist dengan jempol terangkat = SPASI</li>
            <li>• Telapak terbuka (5 jari) = ENTER/Ucapkan</li>
            <li>• Gestur ENTER akan otomatis mengucapkan kalimat dengan TTS backend</li>
            <li>• Tombol "Ucapkan Manual" untuk TTS browser</li>
          </ul>
        </div>
        <div className="mt-4 text-sm text-blue-600 bg-blue-100 p-3 rounded">
          <strong>Production Info:</strong> Backend: {API_BASE_URL}
        </div>
      </div>
    </div>
  );
};

export default WebcamCapture;