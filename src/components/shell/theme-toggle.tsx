"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      const d = localStorage.getItem("theme") === "dark";
      setDark(d);
      document.documentElement.classList.toggle("dark", d);
    } catch {}
  }, []);

  function toggle() {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.setItem("theme", d ? "dark" : "light"); } catch {}
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={dark ? "Mode terang" : "Mode gelap"}>
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
