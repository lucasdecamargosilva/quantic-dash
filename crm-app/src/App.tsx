import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Pipeline from "./pages/Pipeline";
import Leads from "./pages/Leads";
import Dashboard from "./pages/Dashboard";
import Objecoes from "./pages/Objecoes";
import Metas from "./pages/Metas";

export default function App() {
  return (
    <BrowserRouter basename="/crm">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/objecoes" element={<Objecoes />} />
          <Route path="/metas" element={<Metas />} />
          {/* Compat: rota antiga /dashboard ainda funciona */}
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
