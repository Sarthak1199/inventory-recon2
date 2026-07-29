import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BranchSwitcher } from "./BranchSwitcher";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/purchase-orders", label: "Purchase Orders" },
  { to: "/grns", label: "GRNs" },
];

export function AppShell() {
  const { account, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {account?.logo_url ? (
              <img src={account.logo_url} alt="logo" className="h-8 w-8 rounded-full bg-white object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                {(account?.brand_name || account?.name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-lg font-semibold">{account?.brand_name || account?.name}</span>
          </div>
          <nav className="hidden gap-6 text-sm font-medium sm:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => (isActive ? "underline underline-offset-4" : "opacity-80 hover:opacity-100")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <BranchSwitcher />
            <div className="text-right text-sm">
              <div className="font-medium">{user?.name}</div>
            </div>
            <button
              onClick={() => logout()}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              Logout
            </button>
          </div>
        </div>
        <nav className="flex gap-4 border-t border-white/10 px-4 py-2 text-sm font-medium sm:hidden">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
