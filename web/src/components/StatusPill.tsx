import { Badge } from './Badge';
import { useHealth } from '@/lib/queries';

// shows the real answer of /health; if the server cannot be reached it says so
export function StatusPill() {
  const { data, isPending, isError } = useHealth();
  if (isPending) return <Badge>checking…</Badge>;
  if (isError || !data?.ok) return <Badge tone="bad">server not reachable</Badge>;
  return <Badge tone="ok">online · v{data.version}</Badge>;
}
