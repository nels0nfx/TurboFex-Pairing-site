import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// a new page starts at the top; a link like /#deploy scrolls to that section
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const el = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
