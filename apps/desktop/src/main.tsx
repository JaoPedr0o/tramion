import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrap } from "./bootstrap";
import "@aun/ui/tokens.css";
import "./App.css";

const { views } = bootstrap();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App views={views} />
  </React.StrictMode>,
);
