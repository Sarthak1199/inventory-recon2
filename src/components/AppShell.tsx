import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const dashboardItem = {
  to: "/",
  label: "Dashboard",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
    </svg>
  ),
};

const procurementItems = [
  {
    to: "/purchase-orders",
    label: "Purchase Orders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l1 4H8l1-4zM4 6h16l-1.5 14H5.5L4 6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6M9 14h6" />
      </svg>
    ),
  },
  {
    to: "/grns",
    label: "GRNs",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h11l3 3v13H5V4z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6M9 15h6" />
      </svg>
    ),
  },
];

const settingsItem = {
  to: "/settings",
  label: "Settings",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
  }`;
}

export function AppShell() {
  const { account, user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-gray-100 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          {account?.logo_url ? (
            <img src={account.logo_url} alt="logo" className="h-8 w-8 rounded-full bg-white object-cover" />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: account?.brand_hex_color || "#4F46E5" }}
            >
              {(account?.brand_name || account?.name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="truncate text-base font-semibold text-gray-900">{account?.brand_name || account?.name}</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            <NavLink to={dashboardItem.to} end className={navLinkClass}>
              {dashboardItem.icon}
              {dashboardItem.label}
            </NavLink>
          </div>

          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Procurement</p>
            <div className="space-y-1">
              {procurementItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLinkClass}>
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <NavLink to={settingsItem.to} className={navLinkClass}>
              {settingsItem.icon}
              {settingsItem.label}
            </NavLink>
          </div>
        </nav>

        <div className="border-t border-gray-100 px-3 py-3">
          <div className="mb-2 px-3 text-sm">
            <div className="truncate font-medium text-gray-900">{user?.name}</div>
            <div className="truncate text-xs text-gray-400">{user?.email}</div>
          </div>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m0-9H5a2 2 0 00-2 2v14a2 2 0 002 2h2" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
