// Resets scroll to the top when the route changes.
//
// A single-page app keeps the document scroll position across client-side
// navigation. So clicking "Health History" from halfway down a long dashboard
// landed the user halfway down the history list — the page had changed but the
// viewport had not followed, which reads as "the link did nothing". This is the
// standard fix and belongs at the router level rather than in every page.
//
// The hash guard is deliberate: an in-page anchor (`#section`) is a scroll the
// user asked for, and resetting it would break the jump.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}
