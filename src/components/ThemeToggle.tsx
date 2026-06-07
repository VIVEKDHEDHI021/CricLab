import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "light" | "dark") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="p-2 rounded-xl border border-border/45 bg-card/60 hover:bg-accent hover:text-accent-foreground transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center text-foreground"
      aria-label="Toggle Theme"
    >
      {theme === "light" ? (
        <Moon className="h-[18px] w-[18px] text-primary transition-all duration-300" />
      ) : (
        <Sun className="h-[18px] w-[18px] text-amber-400 transition-all duration-300 rotate-0 scale-100" />
      )}
    </button>
  );
}
