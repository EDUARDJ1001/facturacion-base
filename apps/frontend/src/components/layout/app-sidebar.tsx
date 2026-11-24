"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Archive,
  ArrowDownUp,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  Database,
  Download,
  FileCheck2,
  FileText,
  HandCoins,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  MonitorCog,
  Package,
  PackagePlus,
  Printer,
  ReceiptText,
  Scale,
  ServerCog,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Truck,
  Users,
  Wallet,
  Warehouse
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { usePendingFeatures } from "@/hooks/use-pending-features";
import { useCompany } from "@/hooks/use-company";
import { cn } from "@/lib/utils";

type NavIcon = typeof LayoutDashboard;

interface NavLeaf {
  href: string;
  label: string;
  icon: NavIcon;
  /** Sin permiso: visible para todos los usuarios (p. ej. impresoras de este equipo). */
  permission?: string;
  /** Solo para estos roles (p. ej. configuración del sistema: SUPERADMIN). */
  roles?: string[];
}

interface NavGroup {
  label: string;
  icon: NavIcon;
  children: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const navigation: NavEntry[] = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard, permission: "dashboard.view" },
  {
    label: "Ventas",
    icon: ShoppingCart,
    children: [
      { href: "/invoices", label: "Facturas", icon: FileText, permission: "invoices.view" },
      { href: "/proformas", label: "Proformas", icon: FileCheck2, permission: "proformas.view" },
      { href: "/quotes", label: "Cotizaciones", icon: ClipboardList, permission: "quotes.view" }
    ]
  },
  {
    label: "Catálogo",
    icon: Tags,
    children: [
      { href: "/clients", label: "Clientes", icon: Users, permission: "clients.view" },
      { href: "/products", label: "Productos", icon: Package, permission: "products.view" },
      { href: "/categories", label: "Categorías", icon: Layers, permission: "categories.view" },
      { href: "/warehouses", label: "Bodegas", icon: Warehouse, permission: "warehouses.view" }
    ]
  },
  {
    label: "Inventario",
    icon: Boxes,
    children: [
      { href: "/inventory", label: "Existencias", icon: Boxes, permission: "inventory.view" },
      { href: "/inventory/entries", label: "Entradas", icon: PackagePlus, permission: "inventory.view" },
      { href: "/inventory/movements", label: "Movimientos", icon: ArrowDownUp, permission: "inventory.view" }
    ]
  },
  {
    label: "Finanzas",
    icon: Wallet,
    children: [
      { href: "/caja", label: "Caja", icon: Banknote, permission: "caja.view" },
      { href: "/receivables", label: "Cuentas por cobrar", icon: HandCoins, permission: "receivables.view" },
      { href: "/banks", label: "Bancos", icon: Landmark, roles: ["SUPERADMIN"] },
      { href: "/payables", label: "Cuentas por pagar", icon: ReceiptText, permission: "payables.view" },
      { href: "/suppliers", label: "Proveedores", icon: Truck, permission: "suppliers.view" }
    ]
  },
  { href: "/reports", label: "Reportes", icon: BarChart3, permission: "reports.view" },
  {
    label: "Administración",
    icon: SlidersHorizontal,
    children: [
      { href: "/company", label: "Empresa", icon: Building2, permission: "company.view" },
      { href: "/invoice-legal", label: "Información legal", icon: Scale, permission: "settings.view" },
      { href: "/settings", label: "Facturación SAR", icon: Settings, permission: "settings.view" },
      { href: "/users", label: "Usuarios", icon: ShieldCheck, permission: "users.view" },
      { href: "/roles", label: "Roles y permisos", icon: KeyRound, permission: "roles.view" },
      { href: "/desactivados", label: "Desactivados", icon: Archive, roles: ["ADMIN", "SUPERADMIN"] }
    ]
  },
  {
    // Configuración interna para el funcionamiento del sistema (equipos, impresión, conexión).
    label: "Sistema",
    icon: ServerCog,
    children: [
      { href: "/registro-cajas", label: "Registro de cajas", icon: MonitorCog, permission: "caja.manage" },
      { href: "/impresoras", label: "Impresoras", icon: Printer },
      { href: "/base-de-datos", label: "Base de datos", icon: Database, roles: ["SUPERADMIN"] },
      { href: "/actualizaciones", label: "Actualizaciones", icon: Download, roles: ["ADMIN", "SUPERADMIN"] }
    ]
  }
];

/** Oculta del menú lo que el rol no puede abrir; el backend lo vuelve a validar. */
function visibleNavigation(can: (key: string) => boolean, role: string | undefined): NavEntry[] {
  const allowed = (leaf: NavLeaf) =>
    (!leaf.roles || (role !== undefined && leaf.roles.includes(role))) && (!leaf.permission || can(leaf.permission));

  return navigation
    .map((entry) => {
      if (!isGroup(entry)) {
        return entry;
      }

      return { ...entry, children: entry.children.filter(allowed) };
    })
    .filter((entry) => (isGroup(entry) ? entry.children.length > 0 : allowed(entry)));
}

/** Todas las hojas en una sola lista, para la barra inferior en móvil. */
function flatten(entries: NavEntry[]): NavLeaf[] {
  return entries.flatMap((entry) => (isGroup(entry) ? entry.children : [entry]));
}

/**
 * Opción activa: la de ruta más larga que coincide con la URL (así /inventory no
 * queda activa estando en /inventory/entries).
 */
function activeHref(pathname: string) {
  return flatten(navigation)
    .map((leaf) => leaf.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

function isLeafActive(href: string, pathname: string) {
  return activeHref(pathname) === href;
}

function groupIsActive(group: NavGroup, pathname: string) {
  return group.children.some((child) => isLeafActive(child.href, pathname));
}

function LeafLink({
  href,
  label,
  icon: Icon,
  isActive,
  nested = false
}: NavLeaf & { isActive: boolean; nested?: boolean }) {
  // Función desactivada mientras falte su actualización de la base.
  const pending = Boolean(usePendingFeatures().featureForPath(href));
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-2xl transition",
        nested ? "px-4 py-2.5 text-[13px] font-medium" : "px-4 py-3 text-sm font-medium",
        isActive ? "bg-white text-slate-900" : "text-white/80 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon size={nested ? 16 : 18} />
      <span className={pending ? "opacity-70" : undefined}>{label}</span>
      {pending ? (
        <span className="ml-auto rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200" title="Falta una actualización de la base de datos">
          Pendiente
        </span>
      ) : null}
    </Link>
  );
}

function GroupItem({ group, pathname }: { group: NavGroup; pathname: string }) {
  const hasActiveChild = groupIsActive(group, pathname);
  const [open, setOpen] = useState(hasActiveChild);

  // Navegar a una página del grupo lo abre, como el treeview de AdminLTE.
  useEffect(() => {
    if (hasActiveChild) {
      setOpen(true);
    }
  }, [hasActiveChild]);

  const Icon = group.icon;
  const panelId = `nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition",
          hasActiveChild && !open ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
        )}
      >
        <Icon size={18} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown size={16} className={cn("transition-transform duration-200", open ? "rotate-180" : "rotate-0")} />
      </button>

      {open ? (
        <div id={panelId} className="mt-1 flex flex-col gap-1 border-l border-white/15 pl-3 ml-5">
          {group.children.map((child) => (
            <LeafLink key={child.href} {...child} isActive={isLeafActive(child.href, pathname)} nested />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { activeCompany } = useCompany();
  const { can, user } = useAuth();
  const entries = visibleNavigation(can, user?.role);

  return (
    <aside
      className="no-print hidden min-h-screen flex-col border-r border-white/10 px-6 py-8 text-white lg:flex"
      style={{
        background: activeCompany?.sidebarColor ?? "rgb(15,23,42)"
      }}
    >
      <div>
        {activeCompany?.logoUrl ? (
          <div className="mb-5 inline-flex rounded-[24px] bg-white/95 px-5 py-4 shadow-lg shadow-black/10">
            <img
              src={activeCompany.logoUrl}
              alt={`Logo de ${activeCompany.commercialName}`}
              className="h-12 w-auto max-w-[160px] object-contain"
            />
          </div>
        ) : null}
        <p className="text-xs uppercase tracking-[0.32em] text-white/60">Facturación</p>
        <h2 className="mt-3 text-3xl font-semibold">{activeCompany?.commercialName ?? "Multiempresa"}</h2>
        <p className="mt-3 text-sm text-white/70">Administración operativa simple, clara y lista para crecer.</p>
      </div>

      <nav className="mt-10 flex flex-1 flex-col gap-1.5">
        {entries.map((entry) =>
          isGroup(entry) ? (
            <GroupItem key={entry.label} group={entry} pathname={pathname} />
          ) : (
            <LeafLink key={entry.href} {...entry} isActive={isLeafActive(entry.href, pathname)} />
          )
        )}
      </nav>

      <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        <p className="font-semibold text-white">Empresa activa</p>
        <p className="mt-2">{activeCompany?.legalName ?? "Sin selección"}</p>
      </div>
    </aside>
  );
}

export function AppMobileNav() {
  const pathname = usePathname();
  const { activeCompany } = useCompany();
  const { can, user } = useAuth();
  const leaves = flatten(visibleNavigation(can, user?.role));
  const { featureForPath } = usePendingFeatures();

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-white/10 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 text-white shadow-2xl lg:hidden"
      style={{
        background: activeCompany?.sidebarColor ?? "rgb(15,23,42)"
      }}
    >
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {leaves.map((leaf) => {
          const Icon = leaf.icon;
          const isActive = isLeafActive(leaf.href, pathname);

          return (
            <Link
              key={leaf.href}
              href={leaf.href}
              className={cn(
                "flex min-w-[74px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition",
                isActive ? "bg-white text-slate-900" : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={17} />
              <span className="leading-tight">{leaf.label}</span>
              {featureForPath(leaf.href) ? <span className="text-[9px] font-semibold uppercase text-amber-300">Pendiente</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
