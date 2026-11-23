import { aggregate } from "../application/database-query.ts";
import type { DatabaseRow, Property } from "../domain/database.ts";

interface Props {
  rows: readonly DatabaseRow[];
  /** A coluna que dá as categorias (barras). */
  category: Property;
  /** A coluna de número que as barras somam; `null` = contar as linhas. */
  measure: Property | null;
}

/** Formata um número com no máximo duas casas e separadores do português ("1.234,5"). */
const format = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * O gráfico de barras: uma barra por categoria, com o nome, a barra e o valor. As barras usam a cor da opção (nas seleções)
 * ou o acento do aplicativo, e o tamanho é proporcional à maior barra.
 */
export function DatabaseChart({ rows, category, measure }: Props) {
  const bars = aggregate(rows, category, measure);
  const max = Math.max(...bars.map((bar) => bar.value), 0);
  const unit = measure ? `soma de ${measure.name}` : "linhas";

  if (bars.length === 0) {
    return <p className="db-empty">Não há dados para mostrar neste gráfico.</p>;
  }
  return (
    <figure className="chart">
      <figcaption className="chart__caption">
        {category.name}: {unit}
      </figcaption>
      <ul className="chart__bars" aria-label={`Gráfico de ${category.name}`}>
        {bars.map((bar) => (
          <li key={bar.key} className="chart__row">
            <span className="chart__label">{bar.label}</span>
            <span className="chart__track" aria-hidden="true">
              <span
                className={`chart__bar${bar.color ? ` db-chip--${bar.color}` : ""}`}
                style={{ width: max > 0 ? `${(bar.value / max) * 100}%` : "0%" }}
              />
            </span>
            <span className="chart__value">
              {format(bar.value)}
              {measure && <span className="chart__count"> ({bar.count})</span>}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
