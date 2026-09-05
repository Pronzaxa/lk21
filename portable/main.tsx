import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import NuResqApp from "@/components/nuresq/NuResqApp";
import "@/app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root nuRESQ tidak ditemukan.");
}

createRoot(root).render(
  <StrictMode>
    <NuResqApp />
  </StrictMode>,
);
