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
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setScheme(currentScheme());
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return scheme;
}
