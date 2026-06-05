import React, { useEffect, useRef, useState } from "react";
import { Trophy, Award, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Button } from "./ui/button";

interface WinnerCelebrationProps {
  winnerTeamName: string;
  margin: string;
  potmName: string;
  potmRuns: number;
  potmBalls: number;
  potmWickets: number;
  potmImpact: number;
  onComplete: () => void;
}

class VictorySoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  setMute(mute: boolean) {
    this.isMuted = mute;
  }

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playVictoryTheme() {
    if (this.isMuted) return;
    try {
      const ctx = this.init();
      const now = ctx.currentTime;

      // 1. Synthesize crowd roar
      const duration = 7.0;
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.linearRampToValueAtTime(1000, now + 1.0);
      filter.frequency.exponentialRampToValueAtTime(300, now + duration);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.35, now + 0.8);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + duration);

      // 2. Play grand champion fanfare melody (C4, E4, G4, C5, E5, G5)
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
      const times = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.3];

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);

        osc.type = i % 2 === 0 ? "sawtooth" : "square";
        osc.frequency.setValueAtTime(freq, now + times[i]);

        const noteTime = now + times[i];
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.setValueAtTime(0, noteTime);
        oscGain.gain.linearRampToValueAtTime(0.15, noteTime + 0.05);
        oscGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 2.0);

        osc.start(noteTime);
        osc.stop(noteTime + 2.1);
      });
    } catch (e) {
      console.warn("Victory sound synthesis failed", e);
    }
  }
}

const victorySynth = new VictorySoundSynthesizer();

export function WinnerCelebrationOverlay({
  winnerTeamName,
  margin,
  potmName,
  potmRuns,
  potmBalls,
  potmWickets,
  potmImpact,
  onComplete,
}: WinnerCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // Initial sound & haptic trigger
    victorySynth.playVictoryTheme();

    const pattern = [500, 100, 500, 100, 500, 100, 1000, 200, 1000, 200, 1000];
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }

    return () => {
      if (navigator.vibrate) {
        navigator.vibrate(0);
      }
    };
  }, []);

  const toggleMute = () => {
    const nextMute = !muted;
    setMuted(nextMute);
    victorySynth.setMute(nextMute);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Confetti particles
    class Confetti {
      x = Math.random() * width;
      y = Math.random() * -100 - 10;
      vx = Math.random() * 4 - 2;
      vy = Math.random() * 4 + 3;
      size = Math.random() * 7 + 6;
      color = ["#f59e0b", "#fbbf24", "#3b82f6", "#10b981", "#a855f7", "#ec4899", "#ef4444"][
        Math.floor(Math.random() * 7)
      ];
      rotation = Math.random() * 360;
      rotationSpeed = Math.random() * 4 - 2;

      update() {
        this.y += this.vy;
        this.x += this.vx;
        this.rotation += this.rotationSpeed;
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.translate(this.x, this.y);
        c.rotate((this.rotation * Math.PI) / 180);
        c.fillStyle = this.color;
        c.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 1.6);
        c.restore();
      }
    }

    // Firework sparks
    class Spark {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      alpha = 1.0;
      decay = Math.random() * 0.02 + 0.012;
      size = Math.random() * 2.5 + 1.5;

      constructor(x: number, y: number, color: string) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 3;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.color = color;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.05; // gravity
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.alpha -= this.decay;
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.globalAlpha = this.alpha;
        c.fillStyle = this.color;
        c.shadowColor = this.color;
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }

    class Rocket {
      x = Math.random() * (width - 120) + 60;
      y = height;
      tx = Math.random() * (width - 120) + 60;
      ty = Math.random() * (height * 0.55) + 60;
      vx: number;
      vy: number;
      color = ["#fbbf24", "#f59e0b", "#f472b6", "#a78bfa", "#60a5fa", "#34d399"][
        Math.floor(Math.random() * 6)
      ];
      exploded = false;

      constructor() {
        const angle = Math.atan2(this.ty - this.y, this.tx - this.x);
        const speed = Math.random() * 5 + 11;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.vy < 0 && this.y <= this.ty) {
          this.exploded = true;
        }
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.fillStyle = this.color;
        c.beginPath();
        c.arc(this.x, this.y, 3.5, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }

    let particles: (Confetti | Spark)[] = [];
    let rockets: Rocket[] = [];

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const tick = () => {
      ctx.clearRect(0, 0, width, height);

      // Spawn confetti
      if (Math.random() < 0.45) {
        particles.push(new Confetti());
      }

      // Spawn rockets
      if (Math.random() < 0.04 && rockets.length < 4) {
        rockets.push(new Rocket());
      }

      rockets.forEach((r, idx) => {
        r.update();
        r.draw(ctx);
        if (r.exploded) {
          for (let i = 0; i < 70; i++) {
            particles.push(new Spark(r.x, r.y, r.color));
          }
          rockets.splice(idx, 1);
        }
      });

      particles.forEach((p, idx) => {
        p.update();
        p.draw(ctx);
        if (p instanceof Confetti) {
          if (p.y > height + 20) {
            particles.splice(idx, 1);
          }
        } else {
          if (p.alpha <= 0) {
            particles.splice(idx, 1);
          }
        }
      });

      animFrame = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes sweep-left {
          0%, 100% { transform: rotate(-30deg) scaleX(0.8); }
          50% { transform: rotate(-10deg) scaleX(1.2); }
        }
        @keyframes sweep-right {
          0%, 100% { transform: rotate(30deg) scaleX(0.8); }
          50% { transform: rotate(10deg) scaleX(1.2); }
        }
        .animate-sweep-left {
          animation: sweep-left 6s ease-in-out infinite;
        }
        .animate-sweep-right {
          animation: sweep-right 6s ease-in-out infinite;
        }
      `}</style>

      <div className="fixed inset-0 z-[11000] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md overflow-y-auto px-4 select-none">
        {/* Canvas animation layers */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

        {/* Stadium sweep lights */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute bottom-0 left-[10%] w-[50vw] h-[100vh] bg-gradient-to-t from-primary/10 via-primary/2 to-transparent origin-bottom animate-sweep-left filter blur-xl" />
          <div className="absolute bottom-0 right-[10%] w-[50vw] h-[100vh] bg-gradient-to-t from-primary/10 via-primary/2 to-transparent origin-bottom animate-sweep-right filter blur-xl" />
        </div>

        {/* Volume & close control */}
        <div className="absolute top-4 right-4 z-[11002]">
          <button
            onClick={toggleMute}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>

        {/* Celebratory Content Card */}
        <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900/90 to-slate-950/95 border border-primary/30 p-6 md:p-8 rounded-3xl z-10 shadow-[0_0_50px_rgba(249,115,22,0.25)] text-center my-6">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-500 rounded-t-3xl" />

          {/* Heading */}
          <span className="inline-block px-3 py-1 bg-primary/10 border border-primary/20 text-primary rounded-full text-[10px] font-black tracking-widest uppercase mb-3 animate-pulse">
            🏆 Match Finished 🏆
          </span>

          <h1 className="text-3xl md:text-4xl font-black text-white leading-tight uppercase tracking-wider">
            {winnerTeamName}
          </h1>
          <p className="text-lg md:text-xl font-bold text-amber-400 mt-1 uppercase tracking-wide">
            {margin}
          </p>

          {/* Player of the Match Card */}
          <div className="relative mt-8 p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-slate-900 border border-amber-500/30 overflow-hidden shadow-inner">
            <div className="absolute -top-12 -right-12 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-4">
              <Trophy className="h-4 w-4 animate-bounce text-amber-400" /> Player of the Match
            </h3>

            {/* Glowing Trophy Graphic */}
            <div className="relative inline-flex mb-3">
              <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl animate-pulse" />
              <div className="h-16 w-16 rounded-full border-2 border-amber-400/50 bg-slate-950 flex items-center justify-center shadow-lg relative z-10">
                <Award className="h-9 w-9 text-amber-400" />
              </div>
            </div>

            <h2 className="text-xl font-black text-white">{potmName}</h2>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5 text-center text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Batting</span>
                <span className="font-bold text-white">
                  {potmRuns} <span className="text-[10px] font-medium text-muted-foreground">({potmBalls}b)</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Bowling</span>
                <span className="font-bold text-white">
                  {potmWickets} <span className="text-[10px] font-medium text-muted-foreground">Wkt</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block uppercase">Impact Score</span>
                <span className="font-black text-amber-400 flex items-center justify-center gap-0.5">
                  <Sparkles className="h-3 w-3 text-amber-400" /> {potmImpact}
                </span>
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="mt-8">
            <Button
              onClick={onComplete}
              className="w-full py-6 font-black uppercase text-sm rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:opacity-95 text-slate-950 shadow-[0_4px_20px_rgba(249,115,22,0.4)] active:scale-95 transition-transform cursor-pointer"
            >
              Complete Match
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
