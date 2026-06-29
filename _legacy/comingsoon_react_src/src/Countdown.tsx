import { useState, useEffect } from 'react';

const InfiniteNinesCountdown = () => {
  const [seconds, setSeconds] = useState(99);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(prev => prev === 99 ? 98 : 99);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center p-4">
      <div className="relative">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-purple-500 blur-3xl opacity-20"></div>
        
        {/* Main container */}
        <div className="relative bg-black/50 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-purple-500/30 shadow-2xl">
          <h1 className="text-3xl md:text-5xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Coming Soon™
          </h1>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
            {/* Years */}
            <div className="text-center">
              <div className="bg-gradient-to-b from-purple-900/50 to-purple-800/30 rounded-2xl p-4 border border-purple-500/40 backdrop-blur">
                <div className="text-4xl md:text-6xl font-bold text-white mb-2">
                  9
                </div>
                <div className="text-xs md:text-sm text-purple-300 uppercase tracking-wider">
                  Years
                </div>
              </div>
            </div>
            
            {/* Months */}
            <div className="text-center">
              <div className="bg-gradient-to-b from-purple-900/50 to-purple-800/30 rounded-2xl p-4 border border-purple-500/40 backdrop-blur">
                <div className="text-4xl md:text-6xl font-bold text-white mb-2">
                  99
                </div>
                <div className="text-xs md:text-sm text-purple-300 uppercase tracking-wider">
                  Months
                </div>
              </div>
            </div>
            
            {/* Days */}
            <div className="text-center">
              <div className="bg-gradient-to-b from-purple-900/50 to-purple-800/30 rounded-2xl p-4 border border-purple-500/40 backdrop-blur">
                <div className="text-4xl md:text-6xl font-bold text-white mb-2">
                  99
                </div>
                <div className="text-xs md:text-sm text-purple-300 uppercase tracking-wider">
                  Days
                </div>
              </div>
            </div>
            
            {/* Hours */}
            <div className="text-center">
              <div className="bg-gradient-to-b from-purple-900/50 to-purple-800/30 rounded-2xl p-4 border border-purple-500/40 backdrop-blur">
                <div className="text-4xl md:text-6xl font-bold text-white mb-2">
                  99
                </div>
                <div className="text-xs md:text-sm text-purple-300 uppercase tracking-wider">
                  Hours
                </div>
              </div>
            </div>
            
            {/* Minutes */}
            <div className="text-center">
              <div className="bg-gradient-to-b from-purple-900/50 to-purple-800/30 rounded-2xl p-4 border border-purple-500/40 backdrop-blur">
                <div className="text-4xl md:text-6xl font-bold text-white mb-2">
                  99
                </div>
                <div className="text-xs md:text-sm text-purple-300 uppercase tracking-wider">
                  Minutes
                </div>
              </div>
            </div>
            
            {/* Seconds - The magic happens here */}
            <div className="text-center">
              <div className="bg-gradient-to-b from-pink-900/50 to-pink-800/30 rounded-2xl p-4 border border-pink-500/40 backdrop-blur">
                <div className="text-4xl md:text-6xl font-bold text-white mb-2">
                  {seconds}
                </div>
                <div className="text-xs md:text-sm text-pink-300 uppercase tracking-wider">
                  Seconds
                </div>
              </div>
            </div>
          </div>
          
          <p className="text-center mt-8 text-purple-300 text-sm md:text-base opacity-70">
            *Time is relative, especially when you're waiting for something
          </p>
          
          <div className="mt-6 text-center">
            <span className="inline-flex items-center gap-2n text-yellow-400 text-xs md:text-sm animate-pulse">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Feed the Shiba™
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfiniteNinesCountdown;