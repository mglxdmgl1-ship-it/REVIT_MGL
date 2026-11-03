import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Footer, Nav, RequireAdmin, RequireAuth, WhatsAppFloat } from "./components/Layout";
import { ToastProvider } from "./components/ui";
import { AuthProvider } from "./lib/auth";
import Account from "./pages/Account";
import AdminLayout from "./pages/admin/AdminLayout";
import { PaymentMethods, Plans, Releases, SettingsPage } from "./pages/admin/Config";
import Customers from "./pages/admin/Customers";
import Dashboard from "./pages/admin/Dashboard";
import Devices, { Activity } from "./pages/admin/Devices";
import Licenses from "./pages/admin/Licenses";
import Orders from "./pages/admin/Orders";
import { Forgot, Login, Register, ResetPassword } from "./pages/Auth";
import { Checkout, OrderPage } from "./pages/Checkout";
import Home from "./pages/Home";
import { DownloadPage, NotFound, Privacy, Terms } from "./pages/Static";

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 50);
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Shell() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  return (
    <>
      <ScrollManager />
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/descargar" element={<DownloadPage />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/recuperar" element={<Forgot />} />
        <Route path="/nueva-clave" element={<ResetPassword />} />
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/terminos" element={<Terms />} />
        <Route path="/cuenta" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/cuenta/pedido/:id" element={<RequireAuth><OrderPage /></RequireAuth>} />
        <Route path="/comprar/:planId" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Dashboard />} />
          <Route path="pedidos" element={<Orders />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="licencias" element={<Licenses />} />
          <Route path="equipos" element={<Devices />} />
          <Route path="actividad" element={<Activity />} />
          <Route path="planes" element={<Plans />} />
          <Route path="metodos" element={<PaymentMethods />} />
          <Route path="versiones" element={<Releases />} />
          <Route path="ajustes" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!isAdmin && <Footer />}
      {!isAdmin && <WhatsAppFloat />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
