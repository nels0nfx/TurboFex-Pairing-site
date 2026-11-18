import { Glass } from '@/components/fx/Glass';
import { PluginCard } from '@/components/PluginCard';
import { useStore } from '@/lib/queries';

// real plugins from the store, with honest loading, empty, paused and error messages
export function FeaturedPlugins() {
  const { data, isPending, isError } = useStore();
  const all = data && Array.isArray(data.plugins) ? data.plugins : [];
  const list = data && !data.paused ? [...all].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).slice(0, 3) : [];
  const anyFeatured = list.some((p) => p.featured);
  if (isPending) return <div className="grid gap-3 md:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="glass h-44 animate-pulse rounded-2xl" />)}</div>;
  if (isError) return <Glass className="p-5">The plugin list cannot be loaded right now.</Glass>;
  if (data?.paused) return <Glass className="p-5">The store is paused for a moment. Please check back soon.</Glass>;
  if (!list.length) return <Glass className="p-5">No plugins are published yet. Approved plugins appear here.</Glass>;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">{list.map((p) => <PluginCard key={p.id} p={p} />)}</div>
      {!anyFeatured && <p className="mt-4 text-center text-sm text-mute">Showing the latest published plugins.</p>}
    </>
  );
}
