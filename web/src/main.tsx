import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { trackPage } from "./ui/analytics";

const root = document.getElementById("root");
if (!root) throw new Error("missing root");

const desk = /^\/desk\/?$/.test(window.location.pathname);

async function boot(): Promise<void> {
  if (desk) {
    await import("./desk.css");
    const { Desk } = await import("./ui/Desk");
    createRoot(root!).render(<StrictMode><Desk /></StrictMode>);
    trackPage("/desk", "FISH Arc · desk");
    return;
  }
  await import("./styles.css");
  const { App } = await import("./App");
  createRoot(root!).render(<StrictMode><App /></StrictMode>);
}

void boot();
