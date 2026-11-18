import { useState } from 'react';
import { cn } from '@/lib/cn';

const groups: { id: string; label: string; items: { q: string; a: string[] }[] }[] = [
  { id: 'linking', label: 'Linking', items: [
    { q: 'How do I link my WhatsApp?', a: ['Open WhatsApp on your phone. Go to Linked devices (on Android tap the ⋮ menu, on iPhone open Settings). Tap Link a device. Choose Link with phone number instead, or scan the QR code shown here. Enter the pairing code (or finish scanning) and wait for Linked successfully.'] },
    { q: 'Pairing code or QR code, which one?', a: ['The pairing code is easiest when WhatsApp and this page are on the same phone. The QR code is best when you open this page on a computer or another screen and scan it with your phone. If one does not work, try the other.'] },
    { q: 'Which number do I enter?', a: ['The number of the WhatsApp account you want to link. Choose your country, then type the number without the country code. The page counts the digits for you and will not accept more than your country allows.'] },
    { q: 'What is the session ID?', a: ['A one-time ID that looks like TFX-XXXX-XXXX-XXXX. It is shown here and also sent to your WhatsApp chat. Give it to the TurboFex bot. It works once and expires after 5 minutes.'] },
  ] },
  { id: 'safety', label: 'Safety', items: [
    { q: 'Is it safe?', a: ['Never share your pairing code or session ID with anyone. Only pair on this official TurboFex site. In Linked devices, remove any device you do not recognise. Your session is stored encrypted and removed after the ID is used or after 5 minutes.'] },
    { q: 'What does pairing do?', a: ['It links your WhatsApp to your TurboFex bot as a linked device, the same way WhatsApp Web works. You can unlink it any time from Linked devices in WhatsApp.'] },
    { q: 'How do I unlink the bot?', a: ['Open WhatsApp, go to Linked devices, tap the TurboFex device and log out. The bot loses access right away.'] },
  ] },
  { id: 'problems', label: 'Problems', items: [
    { q: 'WhatsApp says “Couldn’t link device” or the code does not work', a: ['Check that the number and country are right, then tap Try again for a fresh code. Wait a few minutes if WhatsApp says it is limiting requests. If it still fails, switch to the QR code.'] },
    { q: 'My code expired or the QR stopped working', a: ['Codes and QR codes only live for a few minutes. Tap Try again on the code or QR screen to get a new one. You do not need to start over.'] },
    { q: 'I did not get the session ID in WhatsApp', a: ['It is also shown on this page, so copy it from here. It works once and expires 5 minutes after it was made. If it expired, link again to get a new one.'] },
    { q: 'Do I need to keep this page open?', a: ['Yes, until you see your session ID. If you refresh by mistake, the page takes you back to your unfinished attempt.'] },
  ] },
];

// quick answers in three groups; opening one question closes the one that was open
export function Faq() {
  const [tab, setTab] = useState(groups[0].id);
  const [open, setOpen] = useState<string | null>(null);
  const g = groups.find((x) => x.id === tab)!;
  return (
    <section aria-labelledby="faq-h" className="space-y-4">
      <h2 id="faq-h" className="text-xl font-semibold tracking-tight">Quick answers about linking</h2>
      <div role="tablist" className="flex gap-1 border-b border-line">
        {groups.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); setOpen(null); }}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm', tab === x.id ? 'border-gold text-fg' : 'border-transparent text-mute hover:text-fg')}>{x.label}</button>
        ))}
      </div>
      <div role="tabpanel" className="divide-y divide-line rounded-xl border border-line bg-panel">
        {g.items.map((it) => (
          <details key={it.q} open={open === it.q} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen((cur) => (o ? it.q : cur === it.q ? null : cur)); }} className="group px-4 py-3">
            <summary className="cursor-pointer list-none font-medium marker:hidden">{it.q}</summary>
            {it.a.map((t) => <p key={t} className="mt-2 text-sm leading-relaxed text-mute">{t}</p>)}
          </details>
        ))}
      </div>
      <p className="text-sm text-mute">Still stuck? <a className="text-info underline" href="https://t.me/+7PwU2Vo9czE1NTRk" target="_blank" rel="noopener noreferrer">Ask in the Telegram group.</a></p>
    </section>
  );
}
