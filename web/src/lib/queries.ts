import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// the real site status; the page never shows a made-up number
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 60_000, retry: 1 });
// the announcement and maintenance notice set in the admin panel
export const useSiteStatus = () => useQuery({ queryKey: ['site-status'], queryFn: api.status, refetchInterval: 120_000, retry: 0 });
// the published plugins (the same list the marketplace uses)
export const useStore = () => useQuery({ queryKey: ['store'], queryFn: api.plugins, retry: 1 });
