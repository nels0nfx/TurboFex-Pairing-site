import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// a new page starts at the top
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
