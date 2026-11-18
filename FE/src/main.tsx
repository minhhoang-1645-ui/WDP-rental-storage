import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import "./styles/index.css";
import "./styles/portal.css";
import "./styles/refresh.css";
import "./styles/light-professional.css";
import "./styles/web-readability.css";
import "./styles/web-spacing.css";
import "./styles/operations-review.css";
import "./components/customer/claim-review.css";
import "./styles/web-finish.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
