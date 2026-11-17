import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StatusPill } from '@/components/StatusPill';

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <StatusPill />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">The new TurboFex site is on its way.</h1>
        <p className="mt-4 max-w-xl text-lg text-mute">This is the foundation of the new design. The pages you use today are not changed.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/design"><Button>See the design kit <ArrowRight size={16} /></Button></Link>
          <a href="/"><Button variant="outline">Back to the current site</Button></a>
        </div>
      </motion.div>
      <Card className="mt-16"><p className="text-sm text-mute">Pairing, the plugin store, the developer centre and the admin panel move here one stage at a time, and only after each one is checked.</p></Card>
    </main>
  );
}
