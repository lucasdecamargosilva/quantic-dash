import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Pipeline from "./pages/Pipeline";
import Leads from "./pages/Leads";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <BrowserRouter basename="/crm">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Pipeline />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
