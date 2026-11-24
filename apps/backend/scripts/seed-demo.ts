import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";

import { dbPool } from "../src/config/db";

interface RoleRow extends RowDataPacket {
  id: number;
  nombre: string;
}

interface CompanyRow extends RowDataPacket {
  id: number;
  code: string;
}

interface UserRow extends RowDataPacket {
  id: number;
}

async function ensureRoles() {
  await dbPool.query(
    `INSERT INTO roles (nombre, descripcion) VALUES
      ('SUPERADMIN', 'Acceso total al sistema'),
      ('ADMIN', 'Administración operativa y fiscal'),
      ('CAJERO', 'Emisión de facturas e historial')
    ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion)`
  );

  const [roles] = await dbPool.query<RoleRow[]>("SELECT id, nombre FROM roles");
  return new Map(roles.map((role) => [role.nombre, role.id]));
}

async function ensureUsers(roleMap: Map<string, number>) {
  const users = [
    {
      username: "superadmin",
      email: "superadmin@local.test",
      fullName: "Super Administrador",
      role: "SUPERADMIN",
      password: "Admin123!"
    },
    {
      username: "admin.demo1",
      email: "admin.demo1@local.test",
      fullName: "Administrador Empresa Demo 1",
      role: "ADMIN",
      password: "Admin123!"
    },
    {
      username: "admin.demo2",
      email: "admin.demo2@local.test",
      fullName: "Administrador Empresa Demo 2",
      role: "ADMIN",
      password: "Admin123!"
    },
    {
      username: "cajero.demo1",
      email: "cajero.demo1@local.test",
      fullName: "Caja Empresa Demo 1",
      role: "CAJERO",
      password: "Caja123!"
    }
  ];

  for (const user of users) {
    const roleId = roleMap.get(user.role);

    if (!roleId) {
      throw new Error(`No se encontró el rol requerido: ${user.role}`);
    }

    const passwordHash = await bcrypt.hash(user.password, 10);

    await dbPool.execute(
      `INSERT INTO users (username, email, password_hash, full_name, role_id, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         password_hash = VALUES(password_hash),
         full_name = VALUES(full_name),
         role_id = VALUES(role_id),
         is_active = VALUES(is_active)`,
      [user.username, user.email, passwordHash, user.fullName, roleId]
    );
  }
}

async function ensureAccess() {
  const [companies] = await dbPool.query<CompanyRow[]>("SELECT id, code FROM companies");
  const companyMap = new Map(companies.map((company) => [company.code, company.id]));

  const accessRules: Record<string, string[]> = {
    superadmin: ["DEMO1", "DEMO2"],
    "admin.demo1": ["DEMO1"],
    "admin.demo2": ["DEMO2"],
    "cajero.demo1": ["DEMO1"]
  };

  for (const [username, companyCodes] of Object.entries(accessRules)) {
    const [userRows] = await dbPool.query<UserRow[]>("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
    const user = userRows[0];

    if (!user) {
      continue;
    }

    for (const code of companyCodes) {
      const companyId = companyMap.get(code);

      if (!companyId) {
        continue;
      }

      await dbPool.execute(
        `INSERT INTO user_company_access (user_id, company_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE company_id = VALUES(company_id)`,
        [user.id, companyId]
      );
    }
  }
}

async function ensureProformaSeries() {
  const [companies] = await dbPool.query<CompanyRow[]>("SELECT id, code FROM companies");

  for (const company of companies) {
    await dbPool.execute(
      `INSERT INTO proforma_series (company_id, prefix, current_number, is_active)
       VALUES (?, 'PRO-', 1, 1)
       ON DUPLICATE KEY UPDATE
         is_active = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [company.id]
    );
  }
}

async function main() {
  const roleMap = await ensureRoles();
  await ensureUsers(roleMap);
  await ensureAccess();
  await ensureProformaSeries();

  console.log("Usuarios demo creados o actualizados correctamente.");
  console.log("- superadmin / Admin123!");
  console.log("- admin.demo1 / Admin123!");
  console.log("- admin.demo2 / Admin123!");
  console.log("- cajero.demo1 / Caja123!");

  await dbPool.end();
}

main().catch(async (error) => {
  console.error("No se pudo ejecutar el seed demo:", error);
  await dbPool.end();
  process.exit(1);
});
