-- ============================================================
-- Base de datos: facturacion_multiempresa
-- Motor: MySQL 8+
-- Descripción:
--   Sistema web de facturación sin inventario, multiempresa
--   (dos empresas de ejemplo), con selección de empresa después del login,
--   correlativo por empresa, configuración fiscal por empresa y
--   correcciones controladas de nombre del cliente y fecha.
-- ============================================================

DROP DATABASE IF EXISTS facturacion_multiempresa;
CREATE DATABASE facturacion_multiempresa
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE facturacion_multiempresa;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- Catálogos básicos
-- ============================================================

CREATE TABLE roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(50) NOT NULL,
  descripcion VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_id (role_id),
  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id) REFERENCES roles (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  commercial_name VARCHAR(150) NOT NULL,
  legal_name VARCHAR(180) NOT NULL,
  rtn VARCHAR(30) NOT NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,

  -- Branding / layout dinámico
  logo_url MEDIUMTEXT NULL,
  favicon_url MEDIUMTEXT NULL,
  -- Imágenes del pie de los documentos (JSON: arreglo de data URIs).
  footer_brands LONGTEXT NULL,
  layout_key VARCHAR(50) NOT NULL,
  primary_color VARCHAR(20) NULL,
  secondary_color VARCHAR(20) NULL,
  sidebar_color VARCHAR(20) NULL,
  header_color VARCHAR(20) NULL,
  -- Color de facturas/proformas/cotizaciones (NULL = color principal).
  document_color VARCHAR(20) NULL,
  theme_mode ENUM('light','dark') NOT NULL DEFAULT 'light',

  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_code (code),
  UNIQUE KEY uq_companies_layout_key (layout_key),
  UNIQUE KEY uq_companies_rtn (rtn)
) ENGINE=InnoDB;

CREATE TABLE user_company_access (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_company (user_id, company_id),
  KEY idx_user_company_company_id (company_id),
  CONSTRAINT fk_user_company_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_user_company_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- Configuración por empresa
-- ============================================================

CREATE TABLE billing_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  default_tax_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  footer_text VARCHAR(255) NULL,
  payable_to VARCHAR(180) NULL,
  invoice_title VARCHAR(100) NOT NULL DEFAULT 'Factura',
  allow_client_name_correction TINYINT(1) NOT NULL DEFAULT 1,
  allow_invoice_date_reissue TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_settings_company_id (company_id),
  CONSTRAINT fk_billing_settings_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE billing_series (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('FACTURA') NOT NULL DEFAULT 'FACTURA',

  -- Formato esperado: 000-001-01-00002002
  establishment_code CHAR(3) NOT NULL,
  point_code CHAR(3) NOT NULL,
  document_code CHAR(2) NOT NULL DEFAULT '01',

  cai VARCHAR(80) NOT NULL,
  issue_deadline DATE NOT NULL,

  range_start INT UNSIGNED NOT NULL,
  range_end INT UNSIGNED NOT NULL,
  current_number INT UNSIGNED NOT NULL, -- siguiente número a asignar

  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_billing_series_company (company_id),
  KEY idx_billing_series_company_active (company_id, is_active),
  CONSTRAINT fk_billing_series_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_billing_series_range
    CHECK (range_start <= range_end),
  CONSTRAINT chk_billing_series_current
    CHECK (current_number >= range_start AND current_number <= range_end + 1)
) ENGINE=InnoDB;

CREATE TABLE proforma_series (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  prefix VARCHAR(10) NOT NULL DEFAULT 'PRO-',
  current_number INT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_proforma_series_company (company_id),
  KEY idx_proforma_series_company_active (company_id, is_active),
  CONSTRAINT fk_proforma_series_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- Clientes
-- ============================================================

CREATE TABLE clients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NULL,
  name VARCHAR(180) NOT NULL,
  rtn VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  is_generic TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_clients_company_code (company_id, code),
  KEY idx_clients_company_name (company_id, name),
  KEY idx_clients_company_rtn (company_id, rtn),
  KEY idx_clients_created_by (created_by),

  CONSTRAINT fk_clients_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_clients_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- Facturas
-- ============================================================

CREATE TABLE invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  billing_series_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,

  invoice_number VARCHAR(20) NOT NULL, -- Ej: 000-001-01-00002002
  sequence_number INT UNSIGNED NOT NULL,

  invoice_date DATE NOT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Snapshot del cliente en la emisión
  customer_name_snapshot VARCHAR(180) NOT NULL,
  customer_rtn_snapshot VARCHAR(30) NULL,
  customer_phone_snapshot VARCHAR(40) NULL,
  customer_address_snapshot VARCHAR(255) NULL,

  -- Snapshot fiscal de la emisión
  company_legal_name_snapshot VARCHAR(180) NOT NULL,
  company_commercial_name_snapshot VARCHAR(150) NOT NULL,
  company_rtn_snapshot VARCHAR(30) NOT NULL,
  company_email_snapshot VARCHAR(150) NULL,
  company_phone_snapshot VARCHAR(40) NULL,
  company_address_snapshot VARCHAR(255) NULL,
  cai_snapshot VARCHAR(80) NOT NULL,
  issue_deadline_snapshot DATE NOT NULL,
  range_start_snapshot INT UNSIGNED NOT NULL,
  range_end_snapshot INT UNSIGNED NOT NULL,

  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  discount_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  taxable_amount_15 DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  exempt_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  exonerated_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  isv_15 DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  grand_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_in_words VARCHAR(255) NULL,

  status ENUM('EMITIDA','ANULADA') NOT NULL DEFAULT 'EMITIDA',
  sale_type ENUM('CONTADO','CREDITO') NOT NULL DEFAULT 'CONTADO',
  due_date DATE NULL,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  payment_status ENUM('PENDIENTE','PARCIAL','PAGADA','ANULADA') NOT NULL DEFAULT 'PAGADA',
  tender_method ENUM('EFECTIVO','TRANSFERENCIA','CHEQUE','TARJETA','OTRO') NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_company_invoice_number (company_id, invoice_number),
  UNIQUE KEY uq_invoices_company_sequence (company_id, sequence_number),
  KEY idx_invoices_company_date (company_id, invoice_date),
  KEY idx_invoices_company_status (company_id, status),
  KEY idx_invoices_customer_id (customer_id),
  KEY idx_invoices_created_by (created_by),
  KEY idx_invoices_billing_series_id (billing_series_id),

  CONSTRAINT fk_invoices_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_billing_series
    FOREIGN KEY (billing_series_id) REFERENCES billing_series (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_customer
    FOREIGN KEY (customer_id) REFERENCES clients (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_invoices_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  line_number INT UNSIGNED NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1.00,
  description VARCHAR(255) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  line_discount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_items_invoice_line (invoice_id, line_number),
  KEY idx_invoice_items_invoice (invoice_id),

  CONSTRAINT fk_invoice_items_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- Correcciones controladas y trazabilidad
-- ============================================================

CREATE TABLE invoice_corrections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,

  correction_type ENUM('NOMBRE_CLIENTE','FECHA_FACTURA','AMBOS') NOT NULL,
  previous_customer_name VARCHAR(180) NULL,
  new_customer_name VARCHAR(180) NULL,
  previous_invoice_date DATE NULL,
  new_invoice_date DATE NULL,

  reason VARCHAR(255) NOT NULL,
  status ENUM('APLICADA','REVERTIDA') NOT NULL DEFAULT 'APLICADA',

  performed_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_invoice_corrections_invoice (invoice_id),
  KEY idx_invoice_corrections_company (company_id),
  KEY idx_invoice_corrections_performed_by (performed_by),

  CONSTRAINT fk_invoice_corrections_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_corrections_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_corrections_performed_by
    FOREIGN KEY (performed_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  action VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_audit_logs_company (company_id),
  KEY idx_audit_logs_user (user_id),
  KEY idx_audit_logs_entity (entity_type, entity_id),

  CONSTRAINT fk_audit_logs_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- Vista útil para reimpresión
-- Toma la última corrección aplicada por factura, si existe.
-- ============================================================

CREATE OR REPLACE VIEW vw_invoice_print_projection AS
SELECT
  i.id AS invoice_id,
  i.company_id,
  i.invoice_number,
  i.sequence_number,
  i.status,

  COALESCE(ic.new_customer_name, i.customer_name_snapshot) AS print_customer_name,
  COALESCE(ic.new_invoice_date, i.invoice_date) AS print_invoice_date,

  i.customer_name_snapshot AS original_customer_name,
  i.invoice_date AS original_invoice_date,

  i.customer_rtn_snapshot,
  i.customer_phone_snapshot,
  i.customer_address_snapshot,

  i.company_legal_name_snapshot,
  i.company_commercial_name_snapshot,
  i.company_rtn_snapshot,
  i.company_email_snapshot,
  i.company_phone_snapshot,
  i.company_address_snapshot,

  i.cai_snapshot,
  i.issue_deadline_snapshot,
  i.range_start_snapshot,
  i.range_end_snapshot,

  i.subtotal,
  i.discount_total,
  i.taxable_amount_15,
  i.exempt_amount,
  i.exonerated_amount,
  i.isv_15,
  i.tax_total,
  i.grand_total,
  i.total_in_words,
  i.notes,
  i.created_by,
  i.created_at,
  i.updated_at
FROM invoices i
LEFT JOIN (
  SELECT c1.*
  FROM invoice_corrections c1
  INNER JOIN (
    SELECT invoice_id, MAX(id) AS max_id
    FROM invoice_corrections
    WHERE status = 'APLICADA'
    GROUP BY invoice_id
  ) x
    ON c1.id = x.max_id
) ic
  ON ic.invoice_id = i.id;

-- ============================================================
-- Procedimiento para tomar el siguiente correlativo de forma segura
-- IMPORTANTE:
--   Llamar este SP dentro del backend al emitir una factura.
--   Luego usar el número retornado para insertar en invoices.
-- ============================================================

DELIMITER $$

CREATE PROCEDURE sp_take_next_invoice_number (
  IN p_company_id BIGINT UNSIGNED,
  OUT p_billing_series_id BIGINT UNSIGNED,
  OUT p_sequence_number INT UNSIGNED,
  OUT p_invoice_number VARCHAR(20)
)
BEGIN
  DECLARE v_billing_series_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_establishment_code CHAR(3);
  DECLARE v_point_code CHAR(3);
  DECLARE v_document_code CHAR(2);
  DECLARE v_current_number INT UNSIGNED;
  DECLARE v_range_start INT UNSIGNED;
  DECLARE v_range_end INT UNSIGNED;
  DECLARE v_issue_deadline DATE;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  DECLARE CONTINUE HANDLER FOR NOT FOUND
    SET v_billing_series_id = NULL;

  START TRANSACTION;

  SELECT
    id,
    establishment_code,
    point_code,
    document_code,
    current_number,
    range_start,
    range_end,
    issue_deadline
  INTO
    v_billing_series_id,
    v_establishment_code,
    v_point_code,
    v_document_code,
    v_current_number,
    v_range_start,
    v_range_end,
    v_issue_deadline
  FROM billing_series
  WHERE company_id = p_company_id
    AND document_type = 'FACTURA'
    AND is_active = 1
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_billing_series_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No existe una serie activa de facturación para la empresa seleccionada.';
  END IF;

  IF CURDATE() > v_issue_deadline THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La fecha límite de emisión del CAI ya venció.';
  END IF;

  IF v_current_number < v_range_start OR v_current_number > v_range_end THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La serie de facturación ya no tiene correlativos disponibles.';
  END IF;

  SET p_billing_series_id = v_billing_series_id;
  SET p_sequence_number = v_current_number;
  SET p_invoice_number = CONCAT(
    v_establishment_code, '-',
    v_point_code, '-',
    v_document_code, '-',
    LPAD(v_current_number, 8, '0')
  );

  UPDATE billing_series
  SET current_number = current_number + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = v_billing_series_id;

  COMMIT;
END$$

DELIMITER ;

-- ============================================================
-- Datos semilla mínimos
-- Ajusta RTN, direcciones, correos, colores y CAI reales antes de usar.
-- ============================================================

INSERT INTO roles (nombre, descripcion) VALUES
('SUPERADMIN', 'Acceso total al sistema'),
('ADMIN', 'Administración operativa y fiscal'),
('CAJERO', 'Emisión de facturas e historial');

INSERT INTO companies (
  code, commercial_name, legal_name, rtn, email, phone, address,
  logo_url, favicon_url, layout_key,
  primary_color, secondary_color, sidebar_color, header_color, theme_mode
) VALUES
(
  'DEMO1', 'Empresa Demo 1', 'Empresa Demo 1 S. de R.L.', '00000000000000',
  'info@empresa1.test', '0000-0000', 'Dirección pendiente',
  NULL, NULL, 'demo1',
  '#0F172A', '#334155', '#111827', '#0F172A', 'dark'
),
(
  'DEMO2', 'Empresa Demo 2', 'Empresa Demo 2 S. de R.L.', '11111111111111',
  'info@empresa2.test', '1111-1111', 'Dirección pendiente',
  NULL, NULL, 'demo2',
  '#7C3AED', '#A78BFA', '#4C1D95', '#6D28D9', 'light'
);

INSERT INTO billing_settings (
  company_id, default_tax_rate, footer_text, payable_to, invoice_title,
  allow_client_name_correction, allow_invoice_date_reissue
) VALUES
(1, 15.00, 'Gracias por su confianza.', 'Empresa Demo 1 S. de R.L.', 'Factura', 1, 1),
(2, 15.00, 'Gracias por su preferencia.', 'Empresa Demo 2 S. de R.L.', 'Factura', 1, 1);

INSERT INTO billing_series (
  company_id, document_type, establishment_code, point_code, document_code,
  cai, issue_deadline, range_start, range_end, current_number, is_active
) VALUES
(1, 'FACTURA', '000', '001', '01', 'CAI-DEMO1-REEMPLAZAR', '2026-12-31', 2001, 2100, 2001, 1),
(2, 'FACTURA', '000', '001', '01', 'CAI-DEMO2-REEMPLAZAR', '2026-12-31', 1, 100, 1, 1);

INSERT INTO proforma_series (company_id, prefix, current_number, is_active) VALUES
(1, 'PRO-', 1, 1),
(2, 'PRO-', 1, 1);

-- ============================================================
-- Cuentas por cobrar / por pagar (ver migración 2026_09_17_000003)
-- ============================================================

CREATE TABLE suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NULL,
  name VARCHAR(180) NOT NULL,
  rtn VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_company_code (company_id, code),
  KEY idx_suppliers_company_name (company_id, name),
  CONSTRAINT fk_suppliers_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_suppliers_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE payable_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  document_number VARCHAR(60) NOT NULL,
  document_date DATE NOT NULL,
  due_date DATE NULL,
  description VARCHAR(255) NULL,
  total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('PENDIENTE','PARCIAL','PAGADA','ANULADA') NOT NULL DEFAULT 'PENDIENTE',
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payable_documents_number (company_id, supplier_id, document_number),
  KEY idx_payable_documents_company_status (company_id, status),
  CONSTRAINT fk_payable_documents_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payable_documents_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payable_documents_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE invoice_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(40) NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method ENUM('EFECTIVO','TRANSFERENCIA','CHEQUE','TARJETA','OTRO') NOT NULL DEFAULT 'EFECTIVO',
  reference VARCHAR(120) NULL,
  notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_payments_receipt (company_id, receipt_number),
  KEY idx_invoice_payments_invoice (invoice_id),
  CONSTRAINT fk_invoice_payments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_payments_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payable_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  payable_document_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(40) NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method ENUM('EFECTIVO','TRANSFERENCIA','CHEQUE','TARJETA','OTRO') NOT NULL DEFAULT 'EFECTIVO',
  reference VARCHAR(120) NULL,
  notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payable_payments_receipt (company_id, receipt_number),
  KEY idx_payable_payments_document (payable_document_id),
  CONSTRAINT fk_payable_payments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payable_payments_document FOREIGN KEY (payable_document_id) REFERENCES payable_documents (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payable_payments_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- Caja: cajas nombradas, sesiones (apertura/cierre) y ledger
-- (ver migraciones 2026_09_19_000003 y 2026_09_19_000004)
-- ============================================================

CREATE TABLE cash_registers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_registers_name (company_id, name),
  KEY idx_cash_registers_company (company_id, is_active),
  CONSTRAINT fk_cash_registers_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cash_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  cash_register_id BIGINT UNSIGNED NOT NULL,
  opened_by BIGINT UNSIGNED NOT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('ABIERTA','CERRADA') NOT NULL DEFAULT 'ABIERTA',
  closed_by BIGINT UNSIGNED NULL,
  closed_at TIMESTAMP NULL,
  counted_amount DECIMAL(14,2) NULL,
  expected_amount DECIMAL(14,2) NULL,
  difference DECIMAL(14,2) NULL,
  opening_notes VARCHAR(255) NULL,
  opening_breakdown JSON NULL,
  closing_notes VARCHAR(255) NULL,
  closing_breakdown JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Guardián: una sola sesión ABIERTA por caja.
  open_guard BIGINT UNSIGNED AS (IF(status = 'ABIERTA', cash_register_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_sessions_open (open_guard),
  KEY idx_cash_sessions_company_status (company_id, status),
  KEY idx_cash_sessions_register (cash_register_id),
  KEY idx_cash_sessions_opened_by (opened_by),
  KEY idx_cash_sessions_opened_at (company_id, opened_at),
  CONSTRAINT fk_cash_sessions_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_sessions_register FOREIGN KEY (cash_register_id) REFERENCES cash_registers (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cash_sessions_opened_by FOREIGN KEY (opened_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cash_sessions_closed_by FOREIGN KEY (closed_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- Equipos (PC) registrados como caja (ver migración 2026_09_23_000001).
CREATE TABLE cash_terminals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  cash_register_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  -- Equipo por token (navegador) o por IP fija (bound_ip); ver migración 2026_09_24_000001.
  token_hash CHAR(64) NULL,
  bound_ip VARCHAR(45) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  registered_by BIGINT UNSIGNED NOT NULL,
  registered_ip VARCHAR(45) NULL,
  last_seen_at TIMESTAMP NULL,
  last_ip VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_terminals_token (token_hash),
  KEY idx_cash_terminals_bound_ip (company_id, bound_ip),
  KEY idx_cash_terminals_company (company_id, is_active),
  KEY idx_cash_terminals_register (cash_register_id),
  CONSTRAINT fk_cash_terminals_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_terminals_register FOREIGN KEY (cash_register_id) REFERENCES cash_registers (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cash_terminals_registered_by FOREIGN KEY (registered_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Redes/IP autorizadas para los equipos de caja (ver migración 2026_09_23_000003).
CREATE TABLE cash_network_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  -- NULL = aplica a todas las cajas de la empresa (ver migración 2026_09_23_000004).
  cash_register_id BIGINT UNSIGNED NULL,
  cidr VARCHAR(64) NOT NULL,
  label VARCHAR(80) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cash_network_rules_scope (company_id, cash_register_id),
  CONSTRAINT fk_cash_network_rules_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_network_rules_register FOREIGN KEY (cash_register_id) REFERENCES cash_registers (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_network_rules_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Códigos de un solo uso para vincular un equipo a una caja (ver migración 2026_09_23_000002).
CREATE TABLE cash_terminal_pairings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  cash_register_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  terminal_name VARCHAR(80) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  used_terminal_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cash_pairings_code (company_id, code_hash),
  KEY idx_cash_pairings_register (cash_register_id, used_at),
  CONSTRAINT fk_cash_pairings_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_pairings_register FOREIGN KEY (cash_register_id) REFERENCES cash_registers (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_pairings_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cash_pairings_terminal FOREIGN KEY (used_terminal_id) REFERENCES cash_terminals (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- Versión de datos en memoria para sincronizar cajas (ver migración 2026_09_24_000003).
CREATE TABLE system_versions (
  version_key VARCHAR(40) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (version_key)
) ENGINE=InnoDB;

INSERT INTO system_versions (version_key, version) VALUES ('permissions', 1);

-- Contadores de documentos (recibos REC-/PG-), bloqueados al tomar el siguiente número (ver migración 2026_09_24_000002).
CREATE TABLE document_counters (
  company_id BIGINT UNSIGNED NOT NULL,
  counter_key VARCHAR(40) NOT NULL,
  last_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, counter_key),
  CONSTRAINT fk_document_counters_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cash_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  session_id BIGINT UNSIGNED NOT NULL,
  type ENUM('APERTURA','VENTA_CONTADO','ABONO_CXC','PAGO_CXP','INGRESO','EGRESO','RETIRO','AJUSTE') NOT NULL,
  method ENUM('EFECTIVO','TRANSFERENCIA','CHEQUE','TARJETA','OTRO') NOT NULL DEFAULT 'EFECTIVO',
  direction ENUM('IN','OUT') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reference_type VARCHAR(30) NULL,
  reference_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cash_movements_session (session_id),
  KEY idx_cash_movements_company_date (company_id, created_at),
  KEY idx_cash_movements_reference (reference_type, reference_id),
  CONSTRAINT fk_cash_movements_company FOREIGN KEY (company_id) REFERENCES companies (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_movements_session FOREIGN KEY (session_id) REFERENCES cash_sessions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_cash_movements_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- Permisos por rol (ver migración 2026_09_18_000001)
-- ============================================================

CREATE TABLE role_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id BIGINT UNSIGNED NOT NULL,
  permission_key VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_permissions (role_id, permission_key),
  KEY idx_role_permissions_role (role_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO role_permissions (role_id, permission_key)
SELECT (SELECT id FROM roles WHERE nombre = 'ADMIN'), k FROM (
  SELECT 'dashboard.view' AS k
  UNION ALL SELECT 'invoices.view' UNION ALL SELECT 'invoices.create' UNION ALL SELECT 'invoices.void'
  UNION ALL SELECT 'proformas.view' UNION ALL SELECT 'proformas.create'
  UNION ALL SELECT 'quotes.view' UNION ALL SELECT 'quotes.create'
  UNION ALL SELECT 'clients.view' UNION ALL SELECT 'clients.create' UNION ALL SELECT 'clients.edit'
  UNION ALL SELECT 'products.view' UNION ALL SELECT 'products.create' UNION ALL SELECT 'products.edit'
  UNION ALL SELECT 'categories.view' UNION ALL SELECT 'categories.create' UNION ALL SELECT 'categories.edit'
  UNION ALL SELECT 'warehouses.view' UNION ALL SELECT 'warehouses.create' UNION ALL SELECT 'warehouses.edit'
  UNION ALL SELECT 'inventory.view' UNION ALL SELECT 'inventory.adjust'
  UNION ALL SELECT 'receivables.view' UNION ALL SELECT 'receivables.pay'
  UNION ALL SELECT 'payables.view' UNION ALL SELECT 'payables.create' UNION ALL SELECT 'payables.pay' UNION ALL SELECT 'payables.void'
  UNION ALL SELECT 'suppliers.view' UNION ALL SELECT 'suppliers.create' UNION ALL SELECT 'suppliers.edit'
  UNION ALL SELECT 'caja.view' UNION ALL SELECT 'caja.open' UNION ALL SELECT 'caja.close' UNION ALL SELECT 'caja.move' UNION ALL SELECT 'caja.manage'
  UNION ALL SELECT 'reports.view'
  UNION ALL SELECT 'users.view' UNION ALL SELECT 'users.create' UNION ALL SELECT 'users.edit'
  UNION ALL SELECT 'company.view' UNION ALL SELECT 'company.edit'
  UNION ALL SELECT 'settings.view' UNION ALL SELECT 'settings.configure'
  UNION ALL SELECT 'roles.view'
) AS admin_keys;

INSERT INTO role_permissions (role_id, permission_key)
SELECT (SELECT id FROM roles WHERE nombre = 'CAJERO'), k FROM (
  SELECT 'dashboard.view' AS k
  UNION ALL SELECT 'invoices.view' UNION ALL SELECT 'invoices.create'
  UNION ALL SELECT 'proformas.view' UNION ALL SELECT 'proformas.create'
  UNION ALL SELECT 'quotes.view' UNION ALL SELECT 'quotes.create'
  UNION ALL SELECT 'clients.view' UNION ALL SELECT 'clients.create'
  UNION ALL SELECT 'products.view'
  UNION ALL SELECT 'inventory.view'
  UNION ALL SELECT 'receivables.view' UNION ALL SELECT 'receivables.pay'
  UNION ALL SELECT 'caja.view' UNION ALL SELECT 'caja.open' UNION ALL SELECT 'caja.close' UNION ALL SELECT 'caja.move'
) AS cajero_keys;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Notas de implementación
-- 1) La tabla invoices guarda snapshots fiscales y del cliente para
--    preservar el documento original emitido.
-- 2) Las correcciones posteriores NO editan el original; se registran
--    en invoice_corrections.
-- 3) Para reimpresión, usar vw_invoice_print_projection.
-- 4) El total en letras se recomienda generarlo en backend.
-- 5) La lógica para impedir cambios en montos, detalle, CAI o correlativo
--    debe forzarse en el backend/API.
-- ============================================================
