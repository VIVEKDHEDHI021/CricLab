import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function SplashScreen() {
  const { loading } = useAuth();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  const [animatingOut, setAnimatingOut] = useState(false);

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + (90 - prev) * 0.08;
        });
      }, 100);
      return () => clearInterval(interval);
    } else {
      setProgress(100);
      const fadeOutTimer = setTimeout(() => {
        setAnimatingOut(true);
      }, 200);

      const removeTimer = setTimeout(() => {
        setVisible(false);
      }, 700);

      return () => {
        clearTimeout(fadeOutTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#070303] select-none transition-opacity duration-500 ease-out ${
        animatingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background blur/gradient ambient light */}
      <div className="absolute inset-0 bg-[#0e0705] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#ea580c]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative flex flex-col items-center justify-center w-full h-full max-w-md px-4">
        {/* Splash Graphic Viewport */}
        <div className="relative w-full h-[85vh] max-h-[800px] flex items-center justify-center overflow-hidden rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/5 bg-[#030101]">
          <img
            src="/Web_Photo_Editor.jpg"
            alt="CricLab Loading..."
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/criclab_logo.png";
            }}
            className="w-full h-full object-cover transform scale-100 transition-transform duration-[4000ms] ease-out"
          />
          
          {/* Bottom vignette gradient to make the loader highly visible */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
          
          {/* Floating progress loader at the bottom overlaying the image */}
          <div className="absolute bottom-8 left-6 right-6 space-y-2 z-20">
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden backdrop-blur-md">
              <div
                className="h-full bg-gradient-to-r from-[#ea580c] to-[#f97316] shadow-[0_0_8px_#ea580c] transition-all duration-75 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/50 font-bold tracking-widest px-0.5">
              <span>LOADING</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

