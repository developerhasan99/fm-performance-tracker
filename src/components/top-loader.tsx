"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Next.js has no navigation events, so: start on internal link clicks / GET form submits / back-forward,
// creep toward 90% while waiting, and finish when the URL actually changes (the new page has rendered).
export function TopLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    const start = () => {
      clearInterval(timer.current);
      setProgress(8);
      timer.current = setInterval(() => setProgress((value) => (value === null ? null : value + (90 - value) * 0.08)), 200);
    };
    const isNewInternalUrl = (url: URL) => url.origin === location.origin && url.href !== location.href;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      if (isNewInternalUrl(new URL(link.href, location.href))) start();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      // Only GET forms with a real URL action navigate; server-action forms stay on the page.
      if (event.defaultPrevented || form.method !== "get" || !form.getAttribute("action")?.startsWith("/")) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("popstate", start);
      clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    clearInterval(timer.current);
    setProgress((value) => (value === null ? null : 100));
    const hide = setTimeout(() => setProgress(null), 300);
    return () => clearTimeout(hide);
  }, [pathname, searchParams]);

  if (progress === null) return null;
  return (
    <div className="top-loader" role="progressbar" aria-label="Loading page" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`top-loader-bar${progress === 100 ? " done" : ""}`} style={{ width: `${progress}%` }} />
    </div>
  );
}
