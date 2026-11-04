# michellpos — POS multi-negocio en la nube

SaaS de punto de venta en Perú: cada negocio se registra, prueba **15 días gratis** y luego paga su plan (Yape, Plin, transferencia o efectivo) para seguir usándolo. Todo el SaaS se administra desde un solo panel privado (`/admin`).

**Producción:** https://michellpos.vercel.app

**Tecnología:** Next.js 15 (App Router) + TypeScript + Tailwind CSS · Supabase (Postgres + Auth + Storage) · Vercel (crones).

---

## 1. Qué incluye (fases terminadas)

| Fase | Qué hace | Dónde |
|---|---|---|
| 1 · Base | Registro + login, planes, prueba 15 días, RLS multi-negocio | `/`, `/registro`, `/login` |
| 2 · Panel del dueño | Clientes, pagos pendientes, activar/suspender/renovar, entrar a cuentas (con auditoría), planes y precios | `/admin` |
| 3 · POS completo | Vender (boleta B001), caja diaria, productos con stock, clientes, reportes, usuarios, configuración | `/app` |
| 4 · Cobros | El cliente declara su pago (Yape/Plin/transferencia/efectivo); tú lo apruebas con 1 clic y su plan activa +30 días | `/app/pagos`, `/admin` |
| 5 · Comprobantes | Ticket térmico 80 mm (imprimir) + **módulo SUNAT SPE** (XML UBL 2.1 firmado, OAuth2, beta/producción) | `/app/comprobante/[venta]`, `/app/sunat` |
| 6 · Operación | Respaldo diario automático a un bucket privado, salud del sistema, avisos de contacto, suspensión automática | `/admin` + crones |

**Extras:**
- ✉️ **Correos automáticos reales** con [Resend](https://resend.com) (bienvenida, prueba por vencer, vencido, suspendido, pago aprobado).
- 📊 **Gráfico de barras** en Reportes (ventas por día, últimos 14 días).
- 🧪 **Datos de demostración** precargados en el negocio de prueba B (53 ventas, 12 productos, 4 clientes).

---

## 2. Estructura del proyecto

```
michellpos/
├── app/
│   ├── page.tsx                    → landing + planes
│   ├── registro/ login/            → alta e inicio de sesión
│   ├── admin/                      → panel del dueño del SaaS (+ /admin/cliente/[id])
│   ├── app/                        → POS (venta, caja, productos, clientes,
│   │                                  reportes, usuarios, pagos, config, sunat)
│   ├── app/comprobante/[ventaId]/  → ticket 80 mm + botón "Enviar a SUNAT"
│   ├── acciones.ts                 → registro/login/logout  (+ email bienvenida)
│   ├── acciones-admin.ts           → panel dueño (+ respaldo manual)
│   ├── acciones-pagos.ts           → declarar/aprobar/rechazar pagos (+ email)
│   └── api/cron/
│       ├── suspension/route.ts     → cron 7:10 a.m.: vencimientos y suspensión
│       └── respaldo/route.ts       → cron 7:00 a.m.: backup diario + avisos
├── components/encabezado.tsx
├── lib/
│   ├── supabase/servidor.ts  admin.ts
│   ├── pos.ts            → contexto del usuario (negocio, rol, estado sub)
│   ├── sunat.ts          → OAuth2 + envío/consulta de comprobantes (SPE)
│   ├── sunat-xml.ts      → XML UBL 2.1 firmado (xml-crypto) + zip
│   ├── avisos.ts         → correos Resend (REST, sin SDK)
│   ├── respaldo.ts       → backup JSON al bucket `backups` + URL firmada
│   └── tipos.ts utilidades.ts sesion.ts
├── supabase/             → SQL de migración (Tablas, RLS, planes, RPC)
├── vercel.json           → crones diarios
└── .env.example
```

## 3. Configuración (desde cero)

### Supabase
1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **Project Settings → API**: copia `Project URL`, `anon public` y `service_role` (⚠️ solo servidor).
3. **SQL Editor**: ejecuta los scripts de `supabase/` (fase 1 primero; después los de cada fase).
4. Para el backup diario crea el bucket privado `backups` (Storage → New bucket) y la tabla `registro_sistema` (script de fase 6).

### Variables de entorno (`.env.local` y Vercel)

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (todo va con RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor: crones, emails, backups |
| `CRON_SECRET` | Clave que usan los crones (`Bearer ...`) |
| `SUNAT_SECRET` | Cifra AES-256 las credenciales SOL de cada cliente |
| `RESEND_API_KEY` | Envío real de correos (ver §6) |
| `RESEND_FROM` | Opcional, ej. `michellpos <avisos@tudoku.io>` |

`.env.local` nunca se sube al repo (está en `.gitignore`).

### Vercel
1. Sube el repo a GitHub e impórtalo en [vercel.com](https://vercel.com).
2. Agrega en **Environment Variables** todas las variables anteriores (production).
3. Deploy. El dominio se cambia en Settings → Domains.

```bash
npm install
npm run build      # verificación local
npx vercel --prod  # o git push (Vercel despliega solo)
```

## 4. Flujo del negocio

**Estados de suscripción:**

```
 en_prueba (15 días) ──► activo ──► vencido ──(3 días de gracia)──► suspendido
        ▲                   │          │
        └── nuevo pago ─────┴──────────┘        suspendido: solo consulta, no vende
```

- El cron de **7:10 a.m. (Perú)** revisa vencimientos y cuenta regresiva; el de **7:00 a.m.** respalda la base de datos y avisa las pruebas que vencen en ≤ 3 días.
- Si no tienes `RESEND_API_KEY`, los correos quedan registrados en `registro_sistema` (evento `email_sin_api_key`) y nada se rompe.

## 5. Cómo dar de alta un cliente (paso a paso)

1. **El cliente se registra solo** en `https://michellpos.vercel.app/registro` con el nombre de su negocio, RUC, teléfono, su nombre y su correo → entra directo al POS con 15 días gratis. Le llega el correo de bienvenida.
2. **Le das sus datos de cobro:** que pague tu plan mensual por Yape/Plin o transferencia (tus cuentas están en la landing y en `Descubre los planes`).
3. **El cliente declara su pago** desde POS → 💳 Suscripción → su pago queda "pendiente" y te aparece en tu `/admin` como banner.
4. **Tú apruebas el pago** (1 clic) → su cuenta queda **Activa 30 días** y le llega el correo de confirmación.
5. Cada día a las 7:10 a.m. el sistema revisa vencimientos: si vence, pasa a **vencido** (avisos + banner en tu panel); al tercer día de gracia se **suspende** automáticamente.
6. Si quieres entrar a ayudar a un cliente: en `/admin` → ver cliente → **Entrar a su cuenta** (queda auditado en `auditoria_admin`).

**Otros pasos útiles:**
- `activar / renovar / suspender` manual: botones en `/admin/cliente/[id]`.
- Crear un usuario adicional para el cliente: POS del cliente → Usuarios (respetando el límite del plan).

## 6. Activar los correos automáticos (Resend, gratis)

1. Crea cuenta gratis en [resend.com](https://resend.com) → **API Keys → Create API Key**.
2. Agrégala en Vercel:
   ```bash
   npx vercel env add RESEND_API_KEY production   # pega: re_xxxx…
   npx vercel --prod                              # redeploy para que tome efecto
   ```
3. Con el dominio gratuito `onboarding@resend.dev` Resend solo envía **al correo de tu propia cuenta de Resend**; para enviar a cualquier cliente, verifica un dominio propio en Resend → Domains y usa:
   ```bash
   npx vercel env add RESEND_FROM production       # michellpos <avisos@tudoku.pe>
   ```
4. Los avisos automáticos que se envían: bienvenida (registro), pago aprobado, prueba por vencer (cron), vencido y suspendido (cron).

## 7. SUNAT: cómo legalizar comprobantes (SPE)

El módulo ya está listo (`/app/sunat` del cliente). Por cliente:
1. Debe tener su **RUC activo** y clave **SOL** (usuario y clave del portal SUNAT).
2. Consigue su **certificado digital `.p12`/`.pfx`** (lo entrega la auxiliar de SUNAT o un certificador autorizado).
3. En `/app/sunat` (solo el dueño del negocio) pega sus credenciales + el certificado y elige **Beta** (pruebas) o **Producción**. Se cifran con AES-256 (`SUNAT_SECRET`) y nunca se guardan en claro.
4. En cada venta el cajero ve el ticket y el botón **Enviar a SUNAT**; el estado del comprobante queda en `/app/comprobante/[venta]`.
5. Hasta conectarse, el **ticket interno es el comprobante válido interno** del negocio (sistema de boleta electrónica free-tier no requiere constancia del sistema conforme factura).

## 8. Respaldos

- **Automático:** todos los días 7:00 a.m. → `backups/backup-…json` (bucket privado de Supabase Storage).
- **Manual:** tu `/admin` → 💾 Crear respaldo ahora.
- **Descarga:** lista de los últimos 5 con enlace firmado de **1 hora** (solo superadmin).
- No incluye las credenciales SUNAT cifradas; tampoco las claves (solo datos de negocio).

## 9. Roles

| Rol | Acceso |
|---|---|
| **superadmin** (dueño del SaaS) | `/admin`: clientes, pagos, planes, entrará a cuentas, salud del sistema, respaldos |
| **dueño** (de un negocio) | TODO el POS de su negocio: vender, caja, productos, reportes, usuarios (según plan), SUNAT, suscripción |
| **administrador** | POS de su negocio, sin zona SUNAT ni suscripción |
| **cajero** | Solo vender y caja |

## 10. Seguridad implementada

1. **RLS en todas las tablas** por `negocio_id` (función `pertenece_al_negocio`) con excepciones para `es_superadmin()`.
2. **`service_role` solo en el servidor** (`lib/supabase/admin.ts`, con `import "server-only"`).
3. **`/admin` validado en el servidor** contra la tabla `superadmins`; un cliente que abre `/admin` es rechazado server-side.
4. **Auditoría** de cada acción del superadmin (`auditoria_admin`).
5. **Crones con clave secreta** (`CRON_SECRET`, `Authorization: Bearer ...`), sin HSR ni exposición.
6. Credenciales SUNAT **cifradas AES-256-GCM** con `SUNAT_SECRET`.
7. Secretos solo en variables de entorno; `.env*.local` en `.gitignore`.

## 11. Probar que un negocio NO ve los datos de otro

Con la sesión de A, en Supabase SQL Editor (simulando el token de A):

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"UUID_DEL_USUARIO_A"}';

select * from negocios;        -- SOLO el negocio de A
select * from ventas;          -- SOLO las ventas de A

rollback;
```

## 12. Convertirte en dueño del SaaS (superadmin)

1. Regístrate con TU correo en `/registro`.
2. En Supabase → SQL Editor:
   ```sql
   insert into public.superadmins (user_id)
   select id from auth.users where email = 'TU-CORREO@ejemplo.com';
   ```
3. Vuelve a iniciar sesión: te llevará a `/admin`.

## 13. Notas de operación

- **Ticket:** `80 mm`, serie `B001`, correlativo automático por negocio (`negocios.correlativo_boleta`).
- **Anular venta** restaura el stock automáticamente.
- **Datos de demostración** (en Bodega El Sol, cuenta de prueba `prueba.b@michellpos.com`): 53 ventas de los últimos 14 días, 12 productos con stock real, 4 clientes. Útiles para mostrar el sistema con reportes con gráfico ya poblado; las ventas reales continúan desde `B001-00054`.
