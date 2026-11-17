import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// the real site status; the page never shows a made-up number
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 60_000, retry: 1 });
