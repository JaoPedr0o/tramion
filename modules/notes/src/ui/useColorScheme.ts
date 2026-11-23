import { useEffect, useState } from "react";

type Scheme = "light" | "dark";

function currentScheme(): Scheme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark" || forced === "light") return forced;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Tema claro ou escuro, como o resto do app: o forçado em `data-theme`, ou o do sistema. */
export function useColorScheme(): Scheme {
  const [scheme, setScheme] = useState(currentScheme);

  useEffect(() => {
    const update = () => setScheme(currentScheme());
    // O tema pode mudar de duas formas: o sistema (preferência) ou o botão de aparência (`data-theme`).
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    if (typeof matchMedia !== "function") return () => observer.disconnect();
    const query = matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", update);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", update);
    };
  }, []);

  return scheme;
}
