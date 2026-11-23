import { useEffect, useRef } from "react";
import type { Day } from "../domain/day.ts";
import { buildHeatmap } from "../domain/heatmap.ts";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const DATE = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
/** "18 de novembro" a partir de AAAA-MM-DD. */
export function longDate(day: Day): string {
  return DATE.format(new Date(`${day}T00:00:00Z`));
}

interface Props {
  counts: ReadonlyMap<Day, number>;
  total: number;
  today: Day;
}

/** Mapa de calor dos últimos seis meses: quanto mais hábitos marcados no dia, mais forte a cor. */
export function Heatmap({ counts, total, today }: Props) {
  const map = buildHeatmap({ counts, total, today });
  const scroller = useRef<HTMLDivElement>(null);
  const marked = [...counts.entries()].filter(([day, count]) => count > 0 && day <= today).length;

  // Em tela estreita o mapa pode rolar: começa mostrando o fim (o dia de hoje).
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, []);

  return (
    <section className="focus-card focus-heatmap" aria-labelledby="focus-heatmap-title">
      <div className="focus-heatmap__head">
        <h3 id="focus-heatmap-title" className="focus-section-title">
          Últimos seis meses
        </h3>
        <p className="focus-heatmap__summary">
          {marked === 0
            ? "Nenhum dia marcado"
            : marked === 1
              ? "1 dia marcado"
              : `${marked} dias marcados`}
        </p>
      </div>
      <div ref={scroller} className="focus-heatmap__scroll">
        <div
          role="img"
          aria-label={`Mapa de calor dos últimos seis meses: ${
            marked === 0 ? "nenhum dia" : marked === 1 ? "1 dia" : `${marked} dias`
          } com hábitos marcados.`}
          className="focus-heatmap__grid"
          style={{ ["--weeks" as string]: map.weeks.length }}
        >
          <div className="focus-heatmap__months" aria-hidden="true">
            {map.monthLabels.map((label) => (
              <span key={label.week} style={{ gridColumn: label.week + 1 }}>
                {MONTHS[label.month - 1]}
              </span>
            ))}
          </div>
          <div className="focus-heatmap__cells" aria-hidden="true">
            {map.weeks.flatMap((week) =>
              week.map((cell) => (
                <span
                  key={cell.day}
                  className="focus-heatmap__cell"
                  data-level={cell.level}
                  data-future={cell.future ? "true" : undefined}
                  title={cell.future ? undefined : `${longDate(cell.day)}: ${cell.count}`}
                />
              )),
            )}
          </div>
        </div>
      </div>
      <p className="focus-heatmap__legend" aria-hidden="true">
        <span>Menos</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className="focus-heatmap__cell" data-level={level} />
        ))}
        <span>Mais</span>
      </p>
    </section>
  );
}
