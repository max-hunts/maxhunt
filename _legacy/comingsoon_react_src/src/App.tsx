import { useState, useEffect, useRef } from 'react';

import InfiniteNinesCountdown from './Countdown';

const ShibaFollower = () => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [shibaX, setShibaX] = useState(200);
  const [shibaState, setShibaState] = useState('sit'); // 'sit', 'walking-right', 'walking-left'
  const [walkFrame, setWalkFrame] = useState(1); // 1 or 2 for animation frames
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [hearts, setHearts] = useState<Array<{ id: number; x: number; y: number; opacity: number }>>([]);
  const [isHovering, setIsHovering] = useState(false);
  const [isClickable, setIsClickable] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  
  // Use ref to store the latest mouse position without triggering re-renders
  const mouseXRef = useRef(0);
  const shibaRef = useRef<HTMLImageElement>(null);

  // Update viewport width on resize
  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let throttleTimeout: number | undefined;
    
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate the bounds (50px from left edge, 50px from right edge)
      const minX = 50;
      const maxX = viewportWidth - 50;
      
      // Clamp the mouse position within bounds
      const clampedX = Math.max(minX, Math.min(maxX, e.clientX));
      mouseXRef.current = clampedX;
      
      // Throttle mouse position updates to reduce re-renders
      if (throttleTimeout) return;
      
      throttleTimeout = window.setTimeout(() => {
        setMouseX(clampedX);
        setMouseY(e.clientY);
        throttleTimeout = undefined;
      }, 16); // ~60fps throttling
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [viewportWidth]);

  useEffect(() => {
    const moveShiba = () => {
      setShibaX(prevX => {
        // Use the ref value for real-time mouse position
        const diff = mouseXRef.current - prevX;
        const threshold = 10; // Distance threshold to stop moving
        const speed = 5;

        if (Math.abs(diff) <= threshold) {
          setShibaState('sit');
          return prevX;
        }

        if (diff > 0) {
          setShibaState('walking-right');
          return prevX + speed;
        } else {
          setShibaState('walking-left');
          return prevX - speed;
        }
      });
    };

    const interval = setInterval(moveShiba, 50); // Update every 50ms for smooth movement
    return () => clearInterval(interval);
  }, []); // Remove mouseX dependency - this interval should run continuously

  // Animation frame switching for walking
  useEffect(() => {
    if (shibaState === 'walking-right' || shibaState === 'walking-left') {
      const frameInterval = setInterval(() => {
        setWalkFrame(prev => prev === 4 ? 1 : prev + 1);
      }, 200); // Switch frame every 200ms

      return () => clearInterval(frameInterval);
    }
  }, [shibaState]);

  const getShibaImage = () => {
    switch (shibaState) {
      case 'walking-right':
        return `src/assets/dog-right-${walkFrame}.png`;
      case 'walking-left':
        return `src/assets/dog-left-${walkFrame}.png`;
      case 'sit':
      default:
        return 'src/assets/dog-sit.png';
    }
  };

  // Add heart animation effect
  const addHeart = () => {
    if (!shibaRef.current) return;
    
    const rect = shibaRef.current.getBoundingClientRect();
    const heartX = rect.left + Math.random() * rect.width;
    const heartY = rect.top + Math.random() * rect.height;
    
    setHearts(prev => [...prev, {
      id: Date.now(),
      x: heartX,
      y: heartY,
      opacity: 1
    }]);
  };

  // Handle click to open Google
  const handleClick = () => {
    if (isClickable) {
      window.open('https://www.linkedin.com/in/maxim-hunt-deseng/', '_blank');
    }
  };

  // Check for hover and manage heart animations
  useEffect(() => {
    if (!shibaRef.current) return;

    const checkHover = () => {
      const rect = shibaRef.current?.getBoundingClientRect();
      if (!rect) return;

      const isHoveringNow = 
        mouseX >= rect.left && 
        mouseX <= rect.right && 
        mouseY >= rect.top && 
        mouseY <= rect.bottom;

      if (isHoveringNow && !isHovering) {
        setIsHovering(true);
        // Start heart animation
        const heartInterval = setInterval(addHeart, 200);
        // Set timer for making clickable
        hoverTimerRef.current = window.setTimeout(() => {
          setIsClickable(true);
        }, 1500);
        // Store interval ID
        return () => {
          clearInterval(heartInterval);
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
          }
        };
      } else if (!isHoveringNow && isHovering) {
        setIsHovering(false);
        setIsClickable(false);
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
      }
    };

    const interval = setInterval(checkHover, 100);
    return () => clearInterval(interval);
  }, [mouseX, mouseY, isHovering]);

  // Heart fade out effect
  useEffect(() => {
    const fadeInterval = setInterval(() => {
      setHearts(prev => 
        prev
          .map(heart => ({ ...heart, opacity: heart.opacity - 0.1 }))
          .filter(heart => heart.opacity > 0)
      );
    }, 100);

    return () => clearInterval(fadeInterval);
  }, []);

  return (
    <div 
      className="w-full h-screen bg-black relative overflow-hidden" 
      style={{ cursor: isClickable ? 'pointer' : 'none' }}
      onClick={handleClick}
    >
      {/* Custom cursor */}
      <div 
        className="fixed pointer-events-none z-50"
        style={{
          left: `${mouseX}px`,
          top: `${mouseY}px`,
          transform: 'translate(-50%, -50%)',
          width: '32px',
          height: '32px',
          backgroundImage: 'url(src/assets/bone.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          display: isClickable ? 'none' : 'block'
        }}
      />

      <InfiniteNinesCountdown />
      
      {/* Shiba at the bottom */}
      <img
        ref={shibaRef}
        src={getShibaImage()}
        alt="Shiba Inu"
        className="absolute bottom-0 w-32 h-32 object-contain transition-all duration-100"
        style={{
          left: `${shibaX-64}px`,
          zIndex: 1
        }}
      />
      
      {/* Hearts */}
      {hearts.map(heart => (
        <div
          key={heart.id}
          className="fixed pointer-events-none"
          style={{
            left: `${heart.x}px`,
            top: `${heart.y}px`,
            transform: 'translate(-50%, -50%)',
            width: '24px',
            height: '24px',
            backgroundImage: 'url(src/assets/heart.png)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            opacity: heart.opacity,
            transition: 'opacity 0.1s linear',
            zIndex: 2
          }}
        />
      ))}
      
      {/* Debug info (remove in production) */}
      {/* <div className="absolute top-4 left-4 text-white text-sm font-mono">
        <div>Mouse X: {mouseX}</div>
        <div>Real Mouse X: {mouseXRef.current}</div>
        <div>Shiba X: {Math.round(shibaX)}</div>
        <div>State: {shibaState}</div>
        <div>Frame: {walkFrame}</div>
      </div> */}
    </div>
  );
};

export default ShibaFollower;

