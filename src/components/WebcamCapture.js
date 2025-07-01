import React, { useRef, useCallback, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import image from '../assets/no-video.png'; // Assuming this path is correct
import UsageInstructionsDialog from '../components/UsageInstructionsDialog'; // Import the new component

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
  const [isInstructionsDialogOpen, setIsInstructionsDialogOpen] = useState(false); // New state for dialog

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
  }, [API_BASE_URL]);

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
  }, [cameraEnabled, sentence, lastCharTime, isProcessing, connectionStatus, API_BASE_URL]);

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

  // Get performance stats (kept for utility, but not in UI directly as per image)
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

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      {/* Hidden audio element for playing backend-generated audio */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnd}
        onError={handleAudioError}
        preload="none"
        style={{ display: 'none' }}
      />

      {/* Error Message */}
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

      {/* Header */}
      <div className="text-start mb-8 flex flex-row items-center justify-between">
        <h1 className="text-xl md:text-3xl font-bold text-gray-800">
          Pengenalan Bahasa Isyarat
        </h1>
        <p>By Rangga Priago</p>
      </div>

      {/* Main Content Area: Left (Webcam) and Right (Detection & Controls) */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">{/* Camera Toggle Button (positioned inside webcam area) */}
        <div className='flex-1 bg-white rounded-lg shadow-md p-4 gap-4 flex flex-col items-start justify-center border border-gray-200 z-0'>
          <div className='flex flex-row gap-3'>
            <button
                  onClick={toggleCamera}
                  disabled={connectionStatus !== 'connected'}
                  className={`left-4 px-4 py-2 rounded-md font-medium text-white transition-colors
                    ${cameraEnabled ? 'bg-red-400 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
                    ${(connectionStatus !== 'connected') ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  {cameraEnabled ? 'Matikan Kamera' : 'Nyalakan Kamera'}
              </button>
              {/* Usage Instructions - Now triggered by a button and displayed in a dialog */}
              <div className="bg-white rounded-lg shadow-m text-center">
                <button
                  onClick={() => setIsInstructionsDialogOpen(true)}
                  className="px-4 py-2 bg-blue-500 text-white font-normal rounded-md hover:bg-blue-600 transition-colors shadow-md"
                >
                  Petunjuk Penggunaan
                </button>
              </div>

              {/* Render the Dialog Component */}
              <UsageInstructionsDialog
                isOpen={isInstructionsDialogOpen}
                onClose={() => setIsInstructionsDialogOpen(false)}
              />

              {/* Hidden Statuses (as they are not in the provided image layout) */}
              <div className="hidden">
                {/* Processing & Chars Info */}
                <div className="text-sm text-gray-500">
                  <div>Processing: {(processingTime * 1000).toFixed(0)}ms</div>
                  <div>Chars: {sentence.length}</div>
                </div>
                {/* Connection Status & Stats Button */}
                <button onClick={getStats}>Stats</button>
              </div>
          </div>
            {/* Left Section: Webcam */}
            <div className="flex-1 min-h-[260px] md:min-h-[480px] w-full bg-white rounded-lg flex items-center justify-center">
              {!cameraEnabled ? (
                // Placeholder for webcam when disabled
                <div className="text-gray-400 text-center flex flex-col justify-center items-center">
                  <img src={image} alt="Disable Camera" className='w-10 opacity-50' />
                  <p className="mt-2 text-sm">Kamera tidak aktif</p>
                </div>
              ) : (
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ 
                    width: 560, 
                    height: 300, 
                    facingMode: 'user' 
                  }}
                  className="w-full h-full object-cover rounded-md"
                  mirrored={true}
                />
              )}
            </div>
        </div>

        {/* Right Section: Detected Character & Controls */}
        <div className="md:w-1/3 flex flex-col gap-6">
          {/* Detected Character */}
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 h-full">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">Karakter Terdeteksi</h2>
            <div className="text-6xl font-bold text-center py-4 text-green-600">
              {formatCurrentChar(currentChar) || (
                <span className="text-gray-400 text-4xl">-</span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-lg shadow-md p-6 border h-full border-gray-200">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">Kontrol</h2>
            <div className="flex flex-col space-y-3">
              <button
                onClick={manualSpeak}
                disabled={isSpeaking || sentence.length === 0}
                className={`px-4 py-2 rounded-md font-medium text-white transition-colors
                  ${isSpeaking || sentence.length === 0
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600'
                  }`}
              >
                Ucapkan Kalimat (Manual)
              </button>
              <button
                onClick={clearSentence}
                disabled={sentence.length === 0 || connectionStatus !== 'connected'}
                className={`px-4 py-2 rounded-md font-medium text-white transition-colors
                  ${sentence.length === 0 || connectionStatus !== 'connected'
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600'
                  }`}
              >
                Hapus Kalimat
              </button>
            </div>
            <div className="mt-4 text-sm text-gray-600 text-center">
              Status: {cameraEnabled ? 'Aktif' : 'Nonaktif'}
              {/* Image only shows "Status: Nonaktif" or "Aktif", not speaking status here */}
            </div>
          </div>
        </div>
      </div>

      {/* Formed Sentence Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8 border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-700">Kalimat Terbentuk</h2>
          <div className="text-sm text-gray-500">{sentence.length} karakter</div>
        </div>
        <div className="min-h-[100px] p-4 bg-gray-50 rounded-md border border-gray-200">
          {sentence.length > 0 ? (
            <p className="text-lg break-words leading-relaxed text-gray-800">
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
    </div>
  );
};

export default WebcamCapture;