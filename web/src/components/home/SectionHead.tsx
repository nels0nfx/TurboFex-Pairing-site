// One heading style for every landing section: small label, big title, one short line.
export function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="tf-stack">
      <p className="tf-eyebrow">{eyebrow}</p>
      <h2 id={id} className="tf-h2 tf-silver">{title}</h2>
      {lead && <p className="tf-lead max-w-xl">{lead}</p>}
    </div>
  );
}
