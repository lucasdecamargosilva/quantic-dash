import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Build é montado sob /crm/ no servidor Express do quantic_dashboard
export default defineConfig({
  base: "/crm/",
  plugins: [react(), tailwindcss()],
});
