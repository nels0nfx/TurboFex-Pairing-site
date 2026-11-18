import { Route, Routes } from 'react-router-dom';
import { Nav } from '@/components/Nav';
import { Notice } from '@/components/Notice';
import Home from '@/pages/Home';
import Pair from '@/pages/Pair';
import Design from '@/pages/Design';
import NotFound from '@/pages/NotFound';
import { ScrollToTop } from '@/components/ScrollToTop';

export default function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-1.5 focus:text-bg">Skip to content</a>
      <Notice />
      <Nav />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pair" element={<Pair />} />
        <Route path="/design" element={<Design />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
