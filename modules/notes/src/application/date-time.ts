/**
 * Valor de uma célula de data: `AAAA-MM-DD` ou, com hora local opcional, `AAAA-MM-DDTHH:MM`.
 * Quem valida de verdade é o Rust; aqui só se divide e se junta o texto (a parte da data é o prefixo de 10 caracteres).
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A parte `AAAA-MM-DD` de um valor de data (com ou sem hora). */
export function datePart(value: string): string {
  return value.slice(0, 10);
}

/** A parte `HH:MM` do valor, ou `null` quando ele só tem data. */
export function timePart(value: string): string | null {
  const time = value.length > 11 && value[10] === "T" ? value.slice(11) : "";
  return TIME.test(time) ? time : null;
}

/** O valor tem o formato de data (com hora opcional)? */
export function isDateValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DATE.test(datePart(value)) &&
    (value.length === 10 || timePart(value) !== null)
  );
}

/** Junta data e hora opcional; hora vazia ou inválida devolve só a data. */
export function joinDateTime(date: string, time: string | null | undefined): string {
  return time && TIME.test(time) ? `${date}T${time}` : date;
}

/** "2026-11-24T14:30" → "24/11/2026 14:30" (ou só a data quando não há hora). */
export function formatDateValue(value: string): string {
  const [year, month, day] = datePart(value).split("-");
  const time = timePart(value);
  return `${day}/${month}/${year}${time ? ` ${time}` : ""}`;
}

/** Instante (em ms) de um valor com hora, no relógio local; `null` se não tiver hora válida. */
export function localInstant(value: string): number | null {
  const time = timePart(value);
  if (time === null || !isDateValue(value)) return null;
  const [year, month, day] = datePart(value).split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return new Date(year, month - 1, day, hour, minute).getTime();
}
