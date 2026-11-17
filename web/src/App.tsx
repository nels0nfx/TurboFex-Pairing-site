import { Route, Routes } from 'react-router-dom';
import { Nav } from '@/components/Nav';
import Home from '@/pages/Home';
import Design from '@/pages/Design';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/design" element={<Design />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
