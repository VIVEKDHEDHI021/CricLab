import React, { useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX, Trophy, Flame, Award, Target } from "lucide-react";
import { Button } from "./ui/button";

interface MilestoneProps {
  milestone: {
    type: "30_runs" | "50_runs" | "100_runs" | "3_wickets" | "5_wickets" | "50_partnership" | "100_partnership";
    playerName: string;
    runs?: number;
    balls?: number;
    sr?: string;
    wickets?: number;
  };
  onClose: () => void;
}

// ----------------------------------------------------
// Web Audio API Synthesizer for offline sound effects
// ----------------------------------------------------
class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Lazy init
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
  }

  getMute() {
    return this.isMuted;
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

  playWicketExplosion() {
    if (this.isMuted) return;
    try {
      const ctx = this.init();
      const now = ctx.currentTime;

      // 1. Bass thump / boom
      const osc = ctx.createOscillator();
      const gainOsc = ctx.createGain();
      osc.connect(gainOsc);
      gainOsc.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);

      gainOsc.gain.setValueAtTime(0.6, now);
      gainOsc.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.start(now);
      osc.stop(now + 0.4);

      // 2. High crash / crackle noise
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1200;
      filter.Q.value = 3.0;

      const gainNoise = ctx.createGain();
      noise.connect(filter);
      filter.connect(gainNoise);
      gainNoise.connect(ctx.destination);

      gainNoise.gain.setValueAtTime(0.3, now);
      gainNoise.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      noise.start(now);
      noise.stop(now + 0.4);
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  }

  playCrowdCheer() {
    if (this.isMuted) return;
    try {
      const ctx = this.init();
      const now = ctx.currentTime;
      const duration = 5.0;

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
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.linearRampToValueAtTime(1100, now + 0.8);
      filter.frequency.exponentialRampToValueAtTime(400, now + duration);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.6);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + duration);
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  }

  playCrowdRoar() {
    if (this.isMuted) return;
    try {
      this.playCrowdCheer();
      const ctx = this.init();
      const now = ctx.currentTime;
      const duration = 6.0;

      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(130, now);
      filter.frequency.linearRampToValueAtTime(240, now + 1.2);
      filter.frequency.exponentialRampToValueAtTime(100, now + duration);
      filter.Q.value = 1.0;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.45, now + 1.0);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + duration);
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  }

  playChampionMelody() {
    if (this.isMuted) return;
    try {
      const ctx = this.init();
      const now = ctx.currentTime;

      // Celebrate notes: C4, E4, G4, C5
      const notes = [261.63, 329.63, 392.00, 523.25];
      const times = [0, 0.15, 0.30, 0.45];

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sawtooth";
        osc.frequency.value = freq;

        const noteTime = now + times[i];
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.12, noteTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 1.4);

        osc.start(noteTime);
        osc.stop(noteTime + 1.5);
      });

      // Octave chime overlay
      notes.reverse().forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.value = freq * 2;

        const noteTime = now + times[i] + 0.08;
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.08, noteTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 1.0);

        osc.start(noteTime);
        osc.stop(noteTime + 1.1);
      });
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  }
}

const synth = new SoundSynthesizer();

export function MilestoneCelebration({ milestone, onClose }: MilestoneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // Initial vibration trigger based on milestone
    let vibrationPattern: number[] = [];
    switch (milestone.type) {
      case "30_runs":
        vibrationPattern = [800, 200, 800, 200, 800, 200, 800, 200, 800]; // 5s strong pulse
        synth.playCrowdCheer();
        break;
      case "50_runs":
        vibrationPattern = [400, 100, 400, 100, 400, 100, 400, 100, 400, 100, 400, 100, 400]; // 5s rhythm pattern
        synth.playCrowdRoar();
        break;
      case "100_runs":
        vibrationPattern = [600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600]; // extended pattern
        synth.playChampionMelody();
        synth.playCrowdRoar();
        break;
      case "3_wickets":
        vibrationPattern = [300, 100, 300, 100, 300, 100, 300, 100, 300, 100, 300]; // 5s sharp pulse
        synth.playWicketExplosion();
        synth.playCrowdCheer();
        break;
      case "5_wickets":
        vibrationPattern = [1000, 200, 1000, 200, 1000, 200, 1000, 200, 1000]; // long pattern
        synth.playWicketExplosion();
        synth.playCrowdRoar();
        break;
      case "50_partnership":
        vibrationPattern = [400, 100, 400, 100, 400, 100, 400];
        synth.playCrowdCheer();
        break;
      case "100_partnership":
        vibrationPattern = [600, 150, 600, 150, 600, 150, 600, 150, 600];
        synth.playChampionMelody();
        synth.playCrowdRoar();
        break;
    }

    if (navigator.vibrate) {
      try {
        navigator.vibrate(vibrationPattern);
      } catch (e) {
        // ignore
      }
    }

    // Auto close after 7 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 7000);

    return () => {
      clearTimeout(timer);
      if (navigator.vibrate) {
        navigator.vibrate(0); // stop vibration
      }
    };
  }, [milestone]);

  // Handle mute toggles
  const toggleMute = () => {
    const nextMute = !muted;
    setMuted(nextMute);
    synth.setMute(nextMute);
  };

  // ----------------------------------------------------
  // Canvas animation setup (Confetti/Fireworks/Wicket physics)
  // ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Particle Classes
    class ConfettiParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      rotation: number;
      rotationSpeed: number;
      oscillationSpeed: number;
      oscillationIndex: number;

      constructor(customColor?: string) {
        const colors = customColor
          ? [customColor]
          : ["#f43f5e", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899"];
        this.x = Math.random() * width;
        this.y = Math.random() * -100 - 10;
        this.vx = Math.random() * 2 - 1;
        this.vy = Math.random() * 3 + 2;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.size = Math.random() * 6 + 5;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 6 - 3;
        this.oscillationSpeed = Math.random() * 0.05 + 0.02;
        this.oscillationIndex = Math.random() * 100;
      }

      update() {
        this.y += this.vy;
        this.x += this.vx + Math.sin(this.oscillationIndex) * 0.5;
        this.oscillationIndex += this.oscillationSpeed;
        this.rotation += this.rotationSpeed;
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.translate(this.x, this.y);
        c.rotate((this.rotation * Math.PI) / 180);
        c.fillStyle = this.color;
        c.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 1.5);
        c.restore();
      }
    }

    class FireworkSpark {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      alpha: number;
      decay: number;
      size: number;

      constructor(x: number, y: number, color: string) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.color = color;
        this.alpha = 1.0;
        this.decay = Math.random() * 0.02 + 0.015;
        this.size = Math.random() * 2 + 1.5;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.06; // gravity
        this.vx *= 0.98; // drag
        this.vy *= 0.98;
        this.alpha -= this.decay;
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.globalAlpha = this.alpha;
        c.fillStyle = this.color;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }

    class Rocket {
      x: number;
      y: number;
      tx: number;
      ty: number;
      vx: number;
      vy: number;
      color: string;
      exploded: boolean;

      constructor(color: string) {
        this.x = Math.random() * (width - 100) + 50;
        this.y = height;
        this.tx = Math.random() * (width - 100) + 50;
        this.ty = Math.random() * (height * 0.4) + 80;
        const angle = Math.atan2(this.ty - this.y, this.tx - this.x);
        const speed = Math.random() * 4 + 10;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.color = color;
        this.exploded = false;
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
        c.arc(this.x, this.y, 3, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }

    class ExplodingWicket {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rotation: number;
      rotationSpeed: number;
      type: "stump" | "bail";
      color: string;

      constructor(x: number, y: number, type: "stump" | "bail", color: string) {
        this.x = x;
        this.y = y;
        this.vx = Math.random() * 8 - 4;
        this.vy = Math.random() * -12 - 4;
        this.rotation = 0;
        this.rotationSpeed = Math.random() * 10 - 5;
        this.type = type;
        this.color = color;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.4; // heavy gravity
        this.rotation += this.rotationSpeed;
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.translate(this.x, this.y);
        c.rotate((this.rotation * Math.PI) / 180);
        c.fillStyle = this.color;
        c.shadowColor = this.color;
        c.shadowBlur = 15;

        if (this.type === "stump") {
          // Draw stump
          c.fillRect(-4, -40, 8, 80);
        } else {
          // Draw bail
          c.fillRect(-12, -4, 24, 8);
        }
        c.restore();
      }
    }

    // Engine Arrays
    let particles: (ConfettiParticle | FireworkSpark)[] = [];
    let rockets: Rocket[] = [];
    let wickets: ExplodingWicket[] = [];

    // Colors mapping
    const getThemeColors = () => {
      switch (milestone.type) {
        case "50_runs":
          return ["#f59e0b", "#fbbf24", "#fef08a", "#d97706"]; // Gold
        case "100_runs":
          return ["#fbbf24", "#f59e0b", "#fbcfe8", "#f472b6", "#a78bfa"]; // Gold + pink + purple
        case "3_wickets":
          return ["#ef4444", "#f87171", "#fee2e2", "#dc2626"]; // Crimson Red
        case "5_wickets":
          return ["#fbbf24", "#f59e0b", "#ef4444", "#dc2626"]; // Gold & Red premium
        case "50_partnership":
          return ["#f59e0b", "#fbbf24", "#3b82f6", "#60a5fa"]; // Gold & Blue
        case "100_partnership":
          return ["#fbbf24", "#f59e0b", "#10b981", "#34d399", "#a78bfa"]; // Gold & Green & Purple
        default:
          return ["#f43f5e", "#3b82f6", "#10b981", "#eab308", "#a855f7"];
      }
    };

    const colors = getThemeColors();

    // Trigger wicket explosion physical parts
    if (milestone.type === "3_wickets" || milestone.type === "5_wickets") {
      const midX = width / 2;
      const midY = height / 2 + 50;
      const stumpColor = milestone.type === "5_wickets" ? "#eab308" : "#ef4444";
      // 3 stumps
      wickets.push(new ExplodingWicket(midX - 25, midY, "stump", stumpColor));
      wickets.push(new ExplodingWicket(midX, midY, "stump", stumpColor));
      wickets.push(new ExplodingWicket(midX + 25, midY, "stump", stumpColor));
      // 2 bails
      wickets.push(new ExplodingWicket(midX - 12, midY - 45, "bail", stumpColor));
      wickets.push(new ExplodingWicket(midX + 12, midY - 45, "bail", stumpColor));
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Main animation loop
    const tick = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Confetti / popper setup
      if (milestone.type === "30_runs") {
        if (Math.random() < 0.35) {
          particles.push(new ConfettiParticle());
        }
      } else if (milestone.type === "100_runs" || milestone.type === "100_partnership") {
        if (Math.random() < 0.25) {
          particles.push(new ConfettiParticle("#f59e0b")); // Gold confetti
        }
      }

      // 2. Rockets generation (for fireworks milestones)
      if (
        milestone.type === "50_runs" ||
        milestone.type === "100_runs" ||
        milestone.type === "5_wickets" ||
        milestone.type === "50_partnership" ||
        milestone.type === "100_partnership"
      ) {
        if (Math.random() < 0.05 && rockets.length < 5) {
          rockets.push(new Rocket(colors[Math.floor(Math.random() * colors.length)]));
        }
      }

      // Update and Draw Rockets
      rockets.forEach((r, idx) => {
        r.update();
        r.draw(ctx);
        if (r.exploded) {
          // Burst sparks
          for (let i = 0; i < 60; i++) {
            particles.push(new FireworkSpark(r.x, r.y, r.color));
          }
          rockets.splice(idx, 1);
        }
      });

      // Update and Draw Stumps / Wickets
      wickets.forEach((w, idx) => {
        w.update();
        w.draw(ctx);
        if (w.y > height + 100) {
          wickets.splice(idx, 1);
        }
      });

      // Update and Draw Sparks / Confetti Particles
      particles.forEach((p, idx) => {
        p.update();
        p.draw(ctx);

        if (p instanceof ConfettiParticle) {
          if (p.y > height + 10) {
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
  }, [milestone]);

  // Layout Render based on Milestone Type
  const renderCardContent = () => {
    switch (milestone.type) {
      case "30_runs":
        return (
          <div className="flex flex-col items-center">
            {/* Glowing Trophy */}
            <div className="relative mb-6 animate-pulse">
              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl scale-125" />
              <div className="w-20 h-20 rounded-full border-4 border-blue-400 p-3 bg-slate-900 shadow-[0_0_20px_rgba(59,130,246,0.6)] flex items-center justify-center relative z-10 animate-bounce">
                <Trophy className="h-10 w-10 text-blue-400" />
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 uppercase tracking-widest text-center animate-bounce">
              🏏 QUICK FIRE 30!
            </h2>
            
            <p className="text-base md:text-lg font-bold text-white mt-4 text-center">
              {milestone.playerName} reaches 30 runs off {milestone.balls || 18} balls
            </p>

            <div className="mt-8 py-2 px-6 bg-blue-500/10 border border-blue-500/30 rounded-full shadow-inner animate-pulse">
              <span className="text-xs md:text-sm font-black text-blue-400 uppercase tracking-wider">
                Keep Going Champion!
              </span>
            </div>
          </div>
        );

      case "50_runs":
        return (
          <div className="flex flex-col items-center">
            {/* Spotlight / Flame animation */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-amber-500/30 blur-2xl scale-150 animate-pulse" />
              <div className="w-20 h-20 rounded-full border-4 border-amber-400 p-3 bg-slate-900 shadow-[0_0_30px_rgba(245,158,11,0.8)] flex items-center justify-center relative z-10">
                <Flame className="h-10 w-10 text-amber-400 animate-pulse" />
              </div>
            </div>

            <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-300 to-yellow-400 uppercase tracking-widest text-center leading-none">
              🔥 HALF CENTURY 🔥
            </h2>
            
            <p className="text-xl font-extrabold text-white mt-5">
              {milestone.playerName}
            </p>

            <p className="text-3xl font-black text-amber-400 mt-2">
              {milestone.runs || 50} Runs
            </p>

            <div className="mt-6 border-t border-white/10 pt-4 w-full text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Strike Rate
              </p>
              <p className="text-lg font-black text-white font-mono mt-0.5">
                {milestone.sr || "162.5"}
              </p>
            </div>
          </div>
        );

      case "100_runs":
        return (
          <div className="flex flex-col items-center">
            {/* Achievement Badge Unlocked */}
            <div className="relative mb-6">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-pink-500 via-amber-500 to-purple-500 opacity-60 blur-xl animate-spin" style={{ animationDuration: "12s" }} />
              <div className="w-22 h-22 rounded-full border-4 border-pink-400 p-2.5 bg-slate-950 shadow-[0_0_40px_rgba(236,72,153,0.8)] flex items-center justify-center relative z-10">
                <Award className="h-12 w-12 text-pink-400 animate-bounce" />
              </div>
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-amber-400 to-purple-500 uppercase tracking-widest text-center leading-none">
              👑 CENTURY 👑
            </h2>
            
            <p className="text-lg md:text-xl font-extrabold text-white mt-5 text-center px-2">
              {milestone.playerName} scores a magnificent 100
            </p>

            <div className="mt-8 py-2.5 px-8 bg-gradient-to-r from-pink-500/10 via-amber-500/10 to-purple-500/10 border border-amber-500/30 rounded-xl shadow-lg">
              <span className="text-xs md:text-sm font-black text-amber-300 uppercase tracking-widest block text-center">
                Legendary Knock
              </span>
            </div>
          </div>
        );

      case "3_wickets":
        return (
          <div className="flex flex-col items-center">
            {/* Red Celebration Wicket */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-red-600/30 blur-xl scale-125 animate-pulse" />
              <div className="w-20 h-20 rounded-full border-4 border-red-500 p-3 bg-slate-900 shadow-[0_0_25px_rgba(239,68,68,0.7)] flex items-center justify-center relative z-10">
                <Target className="h-10 w-10 text-red-500 animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-300 to-red-400 uppercase tracking-widest text-center animate-bounce">
              🎯 WICKET MACHINE
            </h2>
            
            <p className="text-base md:text-lg font-bold text-white mt-4 text-center">
              {milestone.playerName} takes 3 wickets
            </p>

            <div className="mt-8 py-2 px-6 bg-red-500/10 border border-red-500/30 rounded-full shadow-inner animate-pulse">
              <span className="text-xs md:text-sm font-black text-red-400 uppercase tracking-wider">
                Match Turning Spell
              </span>
            </div>
          </div>
        );

      case "5_wickets":
        return (
          <div className="flex flex-col items-center">
            {/* Premium Gold Wicket */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-amber-500/30 blur-2xl scale-150 animate-pulse" />
              <div className="w-20 h-20 rounded-full border-4 border-amber-400 p-3 bg-slate-900 shadow-[0_0_35px_rgba(245,158,11,0.9)] flex items-center justify-center relative z-10">
                <Flame className="h-10 w-10 text-amber-400 animate-bounce" />
              </div>
            </div>

            <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-red-400 to-yellow-400 uppercase tracking-widest text-center leading-none">
              🔥 FIVE WICKET HAUL 🔥
            </h2>
            
            <p className="text-xl font-bold text-white mt-5">
              {milestone.playerName} takes 5 wickets
            </p>

            <div className="mt-8 py-2.5 px-8 bg-amber-500/10 border border-amber-500/30 rounded-xl shadow-lg animate-pulse">
              <span className="text-xs md:text-sm font-black text-amber-400 uppercase tracking-widest block text-center">
                Outstanding Bowling Performance
              </span>
            </div>
          </div>
        );
      case "50_partnership":
        return (
          <div className="flex flex-col items-center">
            {/* Spotlight / Flame animation */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-amber-500/30 blur-2xl scale-150 animate-pulse" />
              <div className="w-20 h-20 rounded-full border-4 border-amber-400 p-3 bg-slate-900 shadow-[0_0_30px_rgba(245,158,11,0.8)] flex items-center justify-center relative z-10">
                <Flame className="h-10 w-10 text-amber-400 animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-sky-300 to-yellow-400 uppercase tracking-widest text-center leading-none">
              🔥 50 PARTNERSHIP 🔥
            </h2>
            
            <p className="text-lg font-extrabold text-white mt-5 text-center px-4">
              {milestone.playerName}
            </p>

            <p className="text-3xl font-black text-amber-400 mt-2">
              {milestone.runs || 50} Runs
            </p>

            {milestone.balls && (
              <p className="text-xs text-muted-foreground mt-1">
                off {milestone.balls} balls
              </p>
            )}

            <div className="mt-6 border-t border-white/10 pt-4 w-full text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Keep Building Champions!
              </p>
            </div>
          </div>
        );
      case "100_partnership":
        return (
          <div className="flex flex-col items-center">
            <div className="relative mb-6">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-pink-500 via-amber-500 to-purple-500 opacity-60 blur-xl animate-spin" style={{ animationDuration: "12s" }} />
              <div className="w-22 h-22 rounded-full border-4 border-pink-400 p-2.5 bg-slate-950 shadow-[0_0_40px_rgba(236,72,153,0.8)] flex items-center justify-center relative z-10">
                <Award className="h-12 w-12 text-pink-400 animate-bounce" />
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-amber-400 to-purple-500 uppercase tracking-widest text-center leading-none">
              👑 100 PARTNERSHIP 👑
            </h2>
            
            <p className="text-lg font-extrabold text-white mt-5 text-center px-4">
              {milestone.playerName}
            </p>

            <p className="text-3xl font-black text-pink-400 mt-2">
              {milestone.runs || 100} Runs
            </p>

            {milestone.balls && (
              <p className="text-xs text-muted-foreground mt-1">
                off {milestone.balls} balls
              </p>
            )}

            <div className="mt-6 border-t border-white/10 pt-4 w-full text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Sensational Stand!
              </p>
            </div>
          </div>
        );
    }
  };

  // Border & Glow details based on type
  const getBorderColor = () => {
    switch (milestone.type) {
      case "30_runs":
        return "border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.3)]";
      case "50_runs":
      case "50_partnership":
        return "border-amber-500/40 shadow-[0_0_60px_rgba(245,158,11,0.4)]";
      case "100_runs":
      case "100_partnership":
        return "border-pink-500/40 shadow-[0_0_80px_rgba(236,72,153,0.5)]";
      case "3_wickets":
        return "border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.3)]";
      case "5_wickets":
        return "border-amber-500/40 shadow-[0_0_70px_rgba(245,158,11,0.45)]";
    }
  };

  return (
    <>
      {/* Inline styles for spotlight animations */}
      <style>{`
        @keyframes spotlight-left {
          0%, 100% { transform: rotate(-25deg) scaleX(0.9); }
          50% { transform: rotate(-8deg) scaleX(1.1); }
        }
        @keyframes spotlight-right {
          0%, 100% { transform: rotate(25deg) scaleX(0.9); }
          50% { transform: rotate(8deg) scaleX(1.1); }
        }
        @keyframes floodlight-left {
          0%, 100% { transform: rotate(-10deg); opacity: 0.15; }
          50% { transform: rotate(15deg); opacity: 0.35; }
        }
        @keyframes floodlight-right {
          0%, 100% { transform: rotate(10deg); opacity: 0.15; }
          50% { transform: rotate(-15deg); opacity: 0.35; }
        }
        .animate-spotlight-left {
          animation: spotlight-left 5s ease-in-out infinite;
        }
        .animate-spotlight-right {
          animation: spotlight-right 5s ease-in-out infinite;
        }
        .animate-floodlight-left {
          animation: floodlight-left 6s ease-in-out infinite;
        }
        .animate-floodlight-right {
          animation: floodlight-right 6s ease-in-out infinite;
        }
      `}</style>

      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/92 backdrop-blur-md select-none overflow-hidden animate-in fade-in duration-300">
        
        {/* Canvas Animations (Fireworks, Confetti) */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

        {/* Stadium Spotlights Sweep (for 50 runs & 5 wickets) */}
        {(milestone.type === "50_runs" || milestone.type === "5_wickets") && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute bottom-0 left-[15%] w-[45vw] h-[100vh] bg-gradient-to-t from-amber-500/15 via-amber-500/3 to-transparent origin-bottom animate-spotlight-left filter blur-md" />
            <div className="absolute bottom-0 right-[15%] w-[45vw] h-[100vh] bg-gradient-to-t from-amber-500/15 via-amber-500/3 to-transparent origin-bottom animate-spotlight-right filter blur-md" />
          </div>
        )}

        {/* Stadium Floodlights (for 100 runs) */}
        {milestone.type === "100_runs" && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 left-0 w-[60vw] h-[100vh] bg-gradient-to-br from-blue-400/20 via-blue-400/3 to-transparent origin-top-left animate-floodlight-left filter blur-md" />
            <div className="absolute top-0 right-0 w-[60vw] h-[100vh] bg-gradient-to-bl from-pink-400/20 via-pink-400/3 to-transparent origin-top-right animate-floodlight-right filter blur-md" />
          </div>
        )}

        {/* Red Wicket Sweep (for 3 wickets) */}
        {milestone.type === "3_wickets" && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60vw] h-[100vh] bg-gradient-to-t from-red-600/15 via-red-600/3 to-transparent origin-bottom animate-pulse filter blur-lg" />
          </div>
        )}

        {/* Overlay Options Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-3 z-[10001]">
          <button
            onClick={toggleMute}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Celebration Milestone Card */}
        <div className={`relative w-[90%] max-w-md bg-slate-950/85 backdrop-blur-xl border p-8 rounded-3xl z-10 transform scale-100 transition-transform duration-300 ${getBorderColor()}`}>
          
          {/* Subtle light streak */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* Render layout */}
          {renderCardContent()}

          {/* Action button */}
          <div className="mt-8 flex justify-center">
            <Button
              onClick={onClose}
              className={`w-full sm:w-auto px-10 font-extrabold rounded-xl py-2.5 shadow-md active:scale-95 cursor-pointer text-white bg-gradient-to-r ${
                milestone.type === "30_runs"
                  ? "from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  : milestone.type === "50_runs"
                  ? "from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  : milestone.type === "100_runs"
                  ? "from-pink-500 via-amber-500 to-purple-500 hover:opacity-95"
                  : milestone.type === "3_wickets"
                  ? "from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700"
                  : "from-amber-500 via-red-500 to-yellow-500 hover:opacity-95"
              }`}
            >
              Awesome!
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
