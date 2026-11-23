/**
 * Posiciona os nós de um grafo numa área, de forma DETERMINÍSTICA (a mesma entrada dá sempre o mesmo desenho), com o
 * método de forças de Fruchterman-Reingold: nós se repelem, ligações puxam, e a força diminui a cada passo.
 */
export interface LayoutNode {
  readonly id: string;
}
export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}
export interface Position {
  readonly x: number;
  readonly y: number;
}

const ITERATIONS = 220;

export function layoutGraph(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  width: number,
  height: number,
  padding = 40,
): ReadonlyMap<string, Position> {
  const count = nodes.length;
  const result = new Map<string, Position>();
  if (count === 0) return result;
  if (count === 1) {
    result.set(nodes[0]!.id, { x: width / 2, y: height / 2 });
    return result;
  }

  const index = new Map(nodes.map((node, i) => [node.id, i] as const));
  const pairs = edges
    .map((edge) => [index.get(edge.from), index.get(edge.to)] as const)
    .filter(
      (pair): pair is readonly [number, number] =>
        pair[0] !== undefined && pair[1] !== undefined && pair[0] !== pair[1],
    );

  // Começa num círculo (ordem dos nós): sem aleatoriedade.
  const radius = Math.min(width, height) / 3;
  const x = nodes.map((_, i) => width / 2 + radius * Math.cos((2 * Math.PI * i) / count));
  const y = nodes.map((_, i) => height / 2 + radius * Math.sin((2 * Math.PI * i) / count));

  const area = Math.max(1, (width - 2 * padding) * (height - 2 * padding));
  const k = Math.sqrt(area / count);
  let temperature = Math.min(width, height) / 8;
  const cooling = temperature / (ITERATIONS + 1);

  for (let step = 0; step < ITERATIONS; step++) {
    const dx = new Array<number>(count).fill(0);
    const dy = new Array<number>(count).fill(0);

    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        let ex = x[a]! - x[b]!;
        let ey = y[a]! - y[b]!;
        let distance = Math.hypot(ex, ey);
        if (distance < 0.01) {
          ex = 0.01 * (a - b);
          ey = 0.01;
          distance = Math.hypot(ex, ey);
        }
        const force = (k * k) / distance;
        dx[a]! += (ex / distance) * force;
        dy[a]! += (ey / distance) * force;
        dx[b]! -= (ex / distance) * force;
        dy[b]! -= (ey / distance) * force;
      }
    }
    for (const [a, b] of pairs) {
      const ex = x[a]! - x[b]!;
      const ey = y[a]! - y[b]!;
      const distance = Math.max(0.01, Math.hypot(ex, ey));
      const force = (distance * distance) / k;
      dx[a]! -= (ex / distance) * force;
      dy[a]! -= (ey / distance) * force;
      dx[b]! += (ex / distance) * force;
      dy[b]! += (ey / distance) * force;
    }
    for (let i = 0; i < count; i++) {
      const length = Math.max(0.01, Math.hypot(dx[i]!, dy[i]!));
      const move = Math.min(length, temperature);
      x[i]! += (dx[i]! / length) * move;
      y[i]! += (dy[i]! / length) * move;
    }
    temperature -= cooling;
  }

  // Ajusta o desenho à área, mantendo as proporções.
  const minX = Math.min(...x);
  const maxX = Math.max(...x);
  const minY = Math.min(...y);
  const maxY = Math.max(...y);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 - minY * scale;
  nodes.forEach((node, i) =>
    result.set(node.id, { x: x[i]! * scale + offsetX, y: y[i]! * scale + offsetY }),
  );
  return result;
}
