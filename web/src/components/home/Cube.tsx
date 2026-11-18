import type { CSSProperties } from 'react';
// The 3D object in the hero: a 3x3x3 block made only with CSS (no 3D library, so it stays light on phones).
// The top layer slowly twists. It is a picture, so it is hidden from screen readers.
const AXIS = [-1, 0, 1] as const;
const FACES = ['fr', 'bk', 'rt', 'lf', 'tp', 'bt'] as const;

const cubies = (y: number) => AXIS.flatMap((x) => AXIS.flatMap((z) => (x === 0 && y === 0 && z === 0 ? [] : [{ x, y, z }])));

export function Cube() {
  return (
    <div className="tf-scene" aria-hidden="true" data-testid="hero-cube">
      <div className="tf-cube-halo" />
      <div className="tf-cube">
        {AXIS.map((y) => (
          <div key={y} className={y === -1 ? 'tf-layer tf-layer--top' : 'tf-layer'}>
            {cubies(y).map(({ x, z }) => (
              <div key={`${x}${z}`} className="tf-cubie" style={{ '--x': x, '--y': y, '--z': z } as CSSProperties}>
                {FACES.map((f) => <i key={f} className={`tf-face ${f}`} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="tf-cube-glow" />
    </div>
  );
}
