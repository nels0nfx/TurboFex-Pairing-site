import { useEffect } from 'react';
import { Footer } from '@/components/Footer';
import { Reveal } from '@/components/Reveal';
import { Hero } from '@/components/home/Hero';
import { Value } from '@/components/home/Value';
import { BotSection } from '@/components/home/BotSection';
import { Deploy } from '@/components/home/Deploy';
import { PlatformMap } from '@/components/home/PlatformMap';
import { Plugins } from '@/components/home/Plugins';
import { Closing } from '@/components/home/Closing';

// The order: what TurboFex is, the bot, how to run it, the whole platform, plugins, then a closing line.
// All the words about the platform come from src/lib/platform.ts.
export default function Home() {
  useEffect(() => { document.title = 'TurboFex | The complete WhatsApp bot platform'; }, []);
  return (
    <>
      <main id="main" className="relative">
        <Hero />
        <Value />
        <Reveal><BotSection /></Reveal>
        <Reveal><Deploy /></Reveal>
        <Reveal><PlatformMap /></Reveal>
        <Reveal><Plugins /></Reveal>
        <Closing />
      </main>
      <Footer />
    </>
  );
}
