import React from 'react';

const UsageInstructionsDialog = ({ isOpen, onClose }) => {
  if (!isOpen) return null; // Don't render anything if not open

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-2xl font-bold"
          aria-label="Close"
        >
          &times;
        </button>

        {/* Dialog Content - Moved from WebcamCapture */}
        <div className="flex flex-col gap-6 min-w-[500px]"> {/* Use flex-col and gap for responsive stacking */}
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Petunjuk Penggunaan & Gestur Khusus</h2>

          <div className="md:grid md:grid-cols-2 gap-8 text-gray-600">
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">Petunjuk Penggunaan:</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Pastikan koneksi internet stabil</li>
                <li>Nyalakan kamera untuk memulai deteksi</li>
                <li>Tunjukkan gestur tangan yang sesuai ke kamera</li>
                <li>Sistem akan mendeteksi huruf secara otomatis</li>
                <li>Tunggu jeda 1.5 detik antar karakter</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">Gestur Khusus:</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Telapak tangan mengepal ke depan = SPASI</li>
                <li>Dua telapak terbuka (10 jari) = ENTER/Ucapkan</li>
                <li>Sistem akan mendeteksi huruf secara otomatis</li>
                <li>Gestur ENTER  otomatis mengucapkan kalimat</li>
                <li>Tombol "Ucapkan Manual" untuk TTS browser</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsageInstructionsDialog;