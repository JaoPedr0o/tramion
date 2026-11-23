import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrap } from "./bootstrap";
import "@aesthetic/ui/tokens.css";
import "./App.css";
import { applyTheme, readTheme } from "./theme";
import { installErrorReporting } from "./error-reporting";

// O tema é aplicado ANTES de desenhar a tela, para não piscar no tema errado.
applyTheme(readTheme());
installErrorReporting();

const { views } = bootstrap();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App views={views} />
  </React.StrictMode>,
);
