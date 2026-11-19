import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ToastProvider } from './components/Toast';
import '@fontsource-variable/inter';
import '@fontsource/instrument-serif';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import './ui.css';

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });
// the router follows the Vite base ("/next/" now, "/" after the final switch)
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
        <ToastProvider>
          <BrowserRouter basename={basename}><App /></BrowserRouter>
        </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
