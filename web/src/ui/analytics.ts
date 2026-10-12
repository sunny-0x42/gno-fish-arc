/** Same Google tag as gnofish.xyz. Arc page titles start with "FISH Arc" so the two hosts stay separable. */
export const GA_ID = "G-1W967FFSVL";

const pending: { path: string; title: string }[] = [];
let waiting = false;

function tagReady(): boolean {
  return typeof window.google_tag_manager === "object" && window.google_tag_manager !== null;
}

function flush(): void {
  const gtag = window.gtag;
  if (typeof gtag !== "function") return;
  for (const item of pending.splice(0)) {
    gtag("event", "page_view", {
      page_path: item.path,
      page_title: item.title,
      page_location: new URL(item.path, window.location.origin).href,
    });
  }
}

/**
 * The loader turns the automatic page view off. A config update does not send a
 * hit, and a page_view pushed before gtag.js finishes is left in the queue.
 * Wait until the tag container is on the page, then send the event.
 * page_location keeps the real host plus the phase, because play does not change the address bar.
 */
export function trackPage(path: string, title: string): void {
  pending.push({ path, title });
  if (tagReady()) {
    flush();
    return;
  }
  if (waiting) return;
  waiting = true;
  const started = Date.now();
  const timer = window.setInterval(() => {
    if (!tagReady() && Date.now() - started < 20000) return;
    window.clearInterval(timer);
    waiting = false;
    if (tagReady()) flush();
    else pending.length = 0;
  }, 200);
}
