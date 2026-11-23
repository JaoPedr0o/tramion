/**
 * Texto "Editado há…" da barra superior. `now` é recebido para a função ser testável com horas fixas.
 * Mostra o tempo relativo; passada uma semana, a data.
 */
export function editedAgo(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 45) return "Editado agora";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Editado há ${Math.max(1, minutes)} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Editado há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "Editado há 1 dia" : `Editado há ${days} dias`;

  return `Editado em ${new Date(updatedAt).toLocaleDateString("pt-BR")}`;
}

/** Quantas subpáginas, no singular ou no plural. */
export function subpagesText(count: number): string {
  return count === 1 ? "1 subpágina" : `${count} subpáginas`;
}
