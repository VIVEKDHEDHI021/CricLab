import React from "react";

export function PageBuffer() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background select-none">
      {/* Glow background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#ea580c]/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center space-y-4">
        {/* GIF container with glowing border */}
        <div className="relative p-1 bg-card rounded-2xl border border-border/80 shadow-2xl flex items-center justify-center w-28 h-28 overflow-hidden">
          <img
            src="/buffer.gif"
            alt="Loading..."
            className="w-full h-full object-contain rounded-xl"
            onError={(e) => {
              // Fail-safe in case gif loading errors
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const spinner = document.createElement("div");
                spinner.className = "w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin";
                parent.appendChild(spinner);
              }
            }}
          />
        </div>

        {/* Text */}
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold tracking-wider text-foreground">
            Loading...
          </p>
          <p className="text-[10px] text-muted-foreground/60 tracking-widest uppercase font-medium">
            Please wait
          </p>
        </div>
      </div>
    </div>
  );
}
