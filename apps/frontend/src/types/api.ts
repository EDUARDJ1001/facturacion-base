export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface User {
  sub: number;
  username: string;
  fullName: string;
  role: string;
}

export interface Company {
  id: number;
  code: string;
  commercialName: string;
  legalName: string;
  rtn: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  layoutKey: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  sidebarColor: string | null;
  headerColor: string | null;
  /** Color de facturas, proformas y cotizaciones (null = color principal). */
  documentColor: string | null;
  themeMode: "light" | "dark";
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends SessionTokens {
  message: string;
  user: User;
  companies: Company[];
  permissions: string[];
}

export interface MeResponse {
  user: User;
  companies: Company[];
  activeCompany: Company | null;
  permissions: string[];
}

export interface RoleWithPermissions {
  id: number;
  name: string;
  description: string | null;
  isSuperadmin: boolean;
  permissions: string[];
}

export interface PermissionCatalogGroup {
  resource: string;
  label: string;
  permissions: { key: string; action: string; label: string }[];
}

export interface ManagedUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  roleId: number;
  role: string;
  isActive: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  companies: Array<{ id: number; code: string; name: string }>;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
}

export interface Client {
  id: number;
  companyId: number;
  code: string | null;
  name: string;
  rtn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isGeneric: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  /** Solo en la lista: saldo a crédito pendiente y fecha de la última compra. */
  pendingBalance?: number;
  lastPurchaseDate?: string | null;
}

export interface ClientSummary {
  client: Client;
  stats: {
    invoiceCount: number;
    totalPurchased: number;
    lastPurchaseDate: string | null;
    pendingBalance: number;
    overdueCount: number;
  };
  recentInvoices: Array<{
    id: number;
    invoiceNumber: string;
    invoiceDate: string;
    saleType: string;
    grandTotal: number;
    balance: number;
  }>;
}

export interface BillingSettings {
  id: number;
  companyId: number;
  defaultTaxRate: number;
  footerText: string | null;
  payableTo: string | null;
  invoiceTitle: string;
  legendOriginal: string;
  legendCopy: string;
  sarNotice: string;
  allowClientNameCorrection: number;
  allowInvoiceDateReissue: number;
}

export type BillingSeriesStatus = "VIGENTE" | "POR_VENCER" | "VENCIDA" | "AGOTADA" | "INACTIVA";

export type BillingDocumentType = "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO" | "RECIBO";

export interface BillingSeries {
  id: number;
  companyId: number;
  documentType: BillingDocumentType;
  establishmentCode: string;
  pointCode: string;
  documentCode: string;
  cai: string;
  resolutionNumber: string | null;
  resolutionDate: string | null;
  issueDeadline: string;
  rangeStart: number;
  rangeEnd: number;
  currentNumber: number;
  isActive: number;
  notes: string | null;
  prefix: string;
  firstNumber: string;
  lastNumber: string;
  nextNumber: string | null;
  totalAuthorized: number;
  issuedCount: number;
  remainingCount: number;
  usedPercent: number;
  daysToDeadline: number;
  status: BillingSeriesStatus;
  warnings: string[];
}

export interface ProductCategory {
  id: number;
  companyId: number;
  name: string;
  description: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductCodeType = "BARRA" | "MANUAL";

export interface ProductCode {
  code: string;
  codeType: ProductCodeType;
}

export interface Product {
  id: number;
  companyId: number;
  categoryId: number | null;
  categoryName: string | null;
  code: string;
  barcode: string | null;
  codes: ProductCode[];
  name: string;
  description: string | null;
  imageUrl: string | null;
  type: "PRODUCTO" | "SERVICIO";
  unitMeasure: string;
  salePrice: number;
  costPrice: number;
  taxable: number;
  taxRate: number;
  controlsStock: number;
  minStock: number;
  isActive: number;
  createdBy: number | null;
  stockQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: number;
  companyId: number;
  code: string;
  name: string;
  address: string | null;
  isDefault: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductStock {
  productId: number;
  productCode: string;
  productName: string;
  imageUrl: string | null;
  productType: "PRODUCTO" | "SERVICIO";
  categoryName: string | null;
  warehouseId: number | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  stockQuantity: number;
  minStock: number;
  unitMeasure: string;
  salePrice: number;
  costPrice: number;
}

export interface InventoryStockSummary {
  totalItems: number;
  totalCost: number;
}

export interface InventoryMovement {
  id: number;
  companyId: number;
  productId: number;
  productCode: string;
  productName: string;
  warehouseId: number;
  warehouseName: string;
  movementType: string;
  sourceType: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  entryId: number | null;
  entryDocumentNumber: string | null;
  /** Proveedor (entradas) o cliente (ventas) del movimiento. */
  supplierName: string | null;
  customerName: string | null;
  quantity: number;
  unitCost: number | null;
  unitPrice: number | null;
  stockBefore: number;
  stockAfter: number;
  notes: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
}

export interface InventoryEntry {
  id: number;
  companyId: number;
  warehouseId: number;
  warehouseName: string;
  entryDate: string;
  supplierId: number | null;
  supplierName: string | null;
  documentNumber: string | null;
  notes: string | null;
  status: string;
  itemCount: number;
  totalCost: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryEntryItem {
  id: number;
  entryId: number;
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  createdAt: string;
}

export interface InventoryEntryDetail extends InventoryEntry {
  items: InventoryEntryItem[];
}

export type SaleType = "CONTADO" | "CREDITO";
export type InvoicePaymentStatus = "PENDIENTE" | "PARCIAL" | "PAGADA" | "ANULADA";
export type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA" | "OTRO";

export interface InvoiceListItem {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  grandTotal: number;
  status: string;
  saleType: SaleType;
  dueDate: string | null;
  paidAmount: number;
  balance: number;
  paymentStatus: InvoicePaymentStatus;
  createdAt: string;
}

export interface InvoiceItem {
  id: number;
  invoiceId: number;
  productId: number | null;
  productCode: string | null;
  productName: string | null;
  lineNumber: number;
  quantity: number;
  description: string;
  unitPrice: number;
  unitCostSnapshot: number | null;
  taxRate: number;
  lineDiscount: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  affectsInventory: number;
}

export interface InvoiceCorrection {
  id: number;
  correctionType: string;
  previousCustomerName: string | null;
  newCustomerName: string | null;
  previousInvoiceDate: string | null;
  newInvoiceDate: string | null;
  reason: string;
  status: string;
  performedBy: number;
  performedByName: string;
  createdAt: string;
}

export interface InvoiceDetail {
  id: number;
  companyId: number;
  customerId: number | null;
  warehouseId: number | null;
  warehouseName: string | null;
  invoiceNumber: string;
  sequenceNumber: number;
  originalInvoiceDate: string;
  printInvoiceDate: string;
  issuedAt: string;
  status: "EMITIDA" | "ANULADA";
  saleType: SaleType;
  dueDate: string | null;
  paidAmount: number;
  balance: number;
  paymentStatus: InvoicePaymentStatus;
  printCustomerName: string;
  originalCustomerName: string;
  customerRtnSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  customerAddressSnapshot: string | null;
  companyLegalNameSnapshot: string;
  companyCommercialNameSnapshot: string;
  companyRtnSnapshot: string;
  companyEmailSnapshot: string | null;
  companyPhoneSnapshot: string | null;
  companyAddressSnapshot: string | null;
  caiSnapshot: string;
  issueDeadlineSnapshot: string;
  rangeStartSnapshot: number;
  rangeEndSnapshot: number;
  subtotal: number;
  discountTotal: number;
  taxableAmount15: number;
  taxableAmount18: number;
  exemptAmount: number;
  exoneratedAmount: number;
  isv15: number;
  isv18: number;
  taxTotal: number;
  grandTotal: number;
  totalInWords: string | null;
  notes: string | null;
  items: InvoiceItem[];
  corrections: InvoiceCorrection[];
  settings: {
    footerText: string | null;
    payableTo: string | null;
    invoiceTitle: string;
  };
}

export type ProformaStatus = "BORRADOR" | "ENVIADA" | "APROBADA" | "RECHAZADA" | "VENCIDA" | "FACTURADA";

export interface ProformaListItem {
  id: number;
  proformaNumber: string;
  proformaDate: string;
  validUntil: string | null;
  customerName: string;
  grandTotal: number;
  status: ProformaStatus;
  convertedToInvoiceId: number | null;
  createdAt: string;
}

export interface ProformaItem {
  id: number;
  proformaId: number;
  productId: number | null;
  productCode: string | null;
  productName: string | null;
  lineNumber: number;
  quantity: number;
  description: string;
  unitPrice: number;
  unitCostSnapshot: number | null;
  taxRate: number;
  lineDiscount: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  affectsInventory: number;
}

export interface ProformaDetail {
  id: number;
  companyId: number;
  proformaSeriesId: number;
  customerId: number | null;
  warehouseId: number | null;
  warehouseName: string | null;
  sequenceNumber: number;
  proformaNumber: string;
  proformaDate: string;
  validUntil: string | null;
  customerNameSnapshot: string;
  customerRtnSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  customerAddressSnapshot: string | null;
  subtotal: number;
  discountTotal: number;
  taxableAmount15: number;
  taxableAmount18: number;
  exemptAmount: number;
  exoneratedAmount: number;
  isv15: number;
  isv18: number;
  taxTotal: number;
  grandTotal: number;
  totalInWords: string | null;
  status: ProformaStatus;
  approvedAt: string | null;
  approvedBy: number | null;
  approvedByName: string | null;
  convertedToInvoiceId: number | null;
  convertedToInvoiceNumber: string | null;
  notes: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  items: ProformaItem[];
  company: {
    commercialName: string;
    legalName: string;
    rtn: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    primaryColor: string | null;
    headerColor: string | null;
    sidebarColor: string | null;
  };
  settings: {
    footerText: string | null;
    payableTo: string | null;
    defaultTaxRate: number;
  };
}

/* ---------- Cotizaciones ---------- */

export type QuoteStatus = "BORRADOR" | "ENVIADA" | "APROBADA" | "RECHAZADA" | "VENCIDA" | "FACTURADA";

export interface QuoteListItem {
  id: number;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string | null;
  customerName: string;
  grandTotal: number;
  status: QuoteStatus;
  convertedToInvoiceId: number | null;
  createdAt: string;
}

export interface QuoteItem {
  id: number;
  quoteId: number;
  productId: number | null;
  productCode: string | null;
  productName: string | null;
  lineNumber: number;
  quantity: number;
  description: string;
  unitPrice: number;
  unitCostSnapshot: number | null;
  taxRate: number;
  lineDiscount: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  affectsInventory: number;
}

export interface QuoteDetail {
  id: number;
  companyId: number;
  quoteSeriesId: number;
  customerId: number | null;
  warehouseId: number | null;
  warehouseName: string | null;
  sequenceNumber: number;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string | null;
  customerNameSnapshot: string;
  customerRtnSnapshot: string | null;
  customerEmailSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  customerAddressSnapshot: string | null;
  subtotal: number;
  discountTotal: number;
  taxableAmount15: number;
  taxableAmount18: number;
  exemptAmount: number;
  exoneratedAmount: number;
  isv15: number;
  isv18: number;
  taxTotal: number;
  grandTotal: number;
  totalInWords: string | null;
  status: QuoteStatus;
  approvedAt: string | null;
  approvedBy: number | null;
  approvedByName: string | null;
  convertedToInvoiceId: number | null;
  convertedToInvoiceNumber: string | null;
  notes: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  items: QuoteItem[];
  company: {
    commercialName: string;
    legalName: string;
    rtn: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    primaryColor: string | null;
    headerColor: string | null;
    sidebarColor: string | null;
  };
  settings: {
    footerText: string | null;
    payableTo: string | null;
    defaultTaxRate: number;
  };
}

/* ---------- Cuentas por cobrar / por pagar ---------- */

export interface Supplier {
  id: number;
  companyId: number;
  code: string | null;
  name: string;
  rtn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Receivable {
  id: number;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  customerId: number | null;
  customerName: string;
  customerRtn: string | null;
  grandTotal: number;
  paidAmount: number;
  balance: number;
  paymentStatus: InvoicePaymentStatus;
  saleType: SaleType;
}

export interface InvoicePayment {
  id: number;
  invoiceId: number;
  receiptNumber: string | null;
  paymentDate: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PayableStatus {
  status: "PENDIENTE" | "PARCIAL" | "PAGADA" | "ANULADA";
}

export interface PayableDocument {
  id: number;
  supplierId: number;
  supplierName: string;
  documentNumber: string;
  documentDate: string | null;
  dueDate: string | null;
  description: string | null;
  total: number;
  paidAmount: number;
  balance: number;
  status: "PENDIENTE" | "PARCIAL" | "PAGADA" | "ANULADA";
  notes: string | null;
}

export interface PayablePayment {
  id: number;
  payableDocumentId: number;
  receiptNumber: string | null;
  paymentDate: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FinanceSummary {
  totalDue: number;
  documents: number;
}

export interface StatementTotals {
  charged: number;
  paid: number;
  balance: number;
}

export interface ClientStatement {
  client: { id: number; name: string; rtn: string | null; phone: string | null; address: string | null };
  invoices: Receivable[];
  payments: (InvoicePayment & { invoiceNumber: string })[];
  totals: StatementTotals;
}

export interface SupplierStatement {
  supplier: { id: number; name: string; rtn: string | null; phone: string | null; address: string | null };
  documents: PayableDocument[];
  payments: (PayablePayment & { documentNumber: string })[];
  totals: StatementTotals;
}

// ---------- Caja (apertura / cierre) ----------

export type CashSessionStatus = "ABIERTA" | "CERRADA";
export type CashMovementType =
  | "APERTURA"
  | "VENTA_CONTADO"
  | "ABONO_CXC"
  | "PAGO_CXP"
  | "INGRESO"
  | "EGRESO"
  | "RETIRO"
  | "AJUSTE";
export type CashDirection = "IN" | "OUT";

export type CashBreakdown = Record<string, number>;

export interface CashRegister {
  id: number;
  name: string;
  isActive: boolean;
}

export interface CashSession {
  id: number;
  cashRegisterId: number;
  registerName: string | null;
  openedBy: number;
  openedByName: string | null;
  openedAt: string;
  openingAmount: number;
  openingBreakdown: CashBreakdown | null;
  status: CashSessionStatus;
  closedBy: number | null;
  closedByName: string | null;
  closedAt: string | null;
  countedAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  closingBreakdown: CashBreakdown | null;
  openingNotes: string | null;
  closingNotes: string | null;
}

export interface CashRegisterState {
  id: number;
  name: string;
  isActive: boolean;
  session: CashSession | null;
  summary: { cashIn: number; cashOut: number; expectedCash: number } | null;
  /** Este equipo puede abrir/cerrar/mover dinero en esta caja. */
  canOperate: boolean;
  canClose: boolean;
}

/** Equipo (PC) registrado como caja física. */
export interface CashTerminal {
  id: number;
  name: string;
  cashRegisterId: number;
  registerName: string;
}

export interface CashTerminalItem extends CashTerminal {
  isActive: boolean;
  lastSeenAt: string | null;
  registeredByName: string | null;
  registeredIp: string | null;
  lastIp: string | null;
  /** IP fija asignada (equipo por IP); null = equipo registrado en el navegador. */
  boundIp: string | null;
  createdAt: string;
}

export interface CashNetworkRule {
  id: number;
  /** null = aplica a todas las cajas. */
  cashRegisterId: number | null;
  registerName: string | null;
  cidr: string;
  label: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CashNetworks {
  items: CashNetworkRule[];
  clientIp: string | null;
  /** Acceso desde la IP actual, caja por caja (reglas generales + las de la caja). */
  byRegister: Array<{ cashRegisterId: number; name: string; restricted: boolean; clientAllowed: boolean }>;
}

export interface CajaOverview {
  registers: CashRegisterState[];
  denominations: number[];
  /** Equipo desde el que se consulta (null = no registrado). */
  terminal: CashTerminal | null;
  /** none: sin registro · ok · invalid: revocado/desconocido · network: fuera de la red autorizada. */
  terminalStatus: "none" | "ok" | "invalid" | "network";
  clientIp: string | null;
  canManage: boolean;
  /** Caja que usaría una venta desde este equipo, o el motivo del bloqueo. */
  saleSession: { id: number; cashRegisterId: number; registerName: string } | null;
  saleBlockedReason: string | null;
}

export interface CashMovement {
  id: number;
  type: CashMovementType;
  method: PaymentMethod;
  direction: CashDirection;
  amount: number;
  referenceType: string | null;
  referenceId: number | null;
  description: string | null;
  createdByName: string | null;
  createdAt: string;
}

export type CashFlowKey = "FONDO" | CashMovementType;

export interface CashFlowRow {
  key: CashFlowKey;
  byMethod: Record<PaymentMethod, number>;
  total: number;
}

export interface CashSummary {
  byMethod: Record<PaymentMethod, { in: number; out: number }>;
  byType: Partial<Record<CashMovementType, number>>;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  /** Cuadro de cierre con signo (salidas negativas); totals = saldo esperado por método. */
  flow: { rows: CashFlowRow[]; totals: { byMethod: Record<PaymentMethod, number>; total: number } };
}

export interface CashSessionDetail {
  session: CashSession;
  movements: CashMovement[];
  summary: CashSummary | null;
}

// ---------- Reportes ----------

export interface SalesReportSummary {
  documents: number;
  subtotal: number;
  discountTotal: number;
  taxable15: number;
  taxable18: number;
  exempt: number;
  isv15: number;
  isv18: number;
  taxTotal: number;
  grandTotal: number;
  contadoTotal: number;
  creditoTotal: number;
}

export interface SalesReportInvoice {
  id: number;
  invoiceNumber: string;
  invoiceDate: string | null;
  customerName: string;
  customerRtn: string | null;
  saleType: SaleType;
  tenderMethod: PaymentMethod | null;
  paymentStatus: InvoicePaymentStatus;
  status: string;
  subtotal: number;
  discountTotal: number;
  isv15: number;
  isv18: number;
  grandTotal: number;
  balance: number;
}

export interface SalesReport {
  filters: {
    dateFrom: string;
    dateTo: string;
    customerId?: number;
    warehouseId?: number;
    saleType: "CONTADO" | "CREDITO" | "all";
    status: "EMITIDA" | "ANULADA" | "all";
  };
  summary: SalesReportSummary;
  byDay: Array<{ day: string | null; documents: number; total: number }>;
  byPaymentMethod: Array<{ method: string; documents: number; total: number }>;
  byProduct: Array<{ productId: number | null; description: string; quantity: number; total: number }>;
  invoices: SalesReportInvoice[];
}
