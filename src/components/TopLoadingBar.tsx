  import React, { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

export function TopLoadingBar() {
  const isPending = useRouterState({ select: (s) => s.status === "pending" });
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: any;
    
    if (isPending) {
      setVisible(true);
      setProgress(15);
      
      // Gradually increment progress up to 90%
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(timer);
            return 90;
          }
          // Smaller incremental steps as it gets closer to 90%
          const diff = 90 - prev;
          return prev + Math.max(diff * 0.1, 0.5);
        });
      }, 100);
    } else {
      setProgress(100);
      
      // Delay hiding to let user see 100% complete bar
      timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }

    return () => {
      clearInterval(timer);
      clearTimeout(timer);
    };
  }, [isPending]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] h-[3px] pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-primary to-accent shadow-[0_0_10px_#ea580c] transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
