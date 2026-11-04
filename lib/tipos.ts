export type Rol = "dueño" | "administrador" | "cajero";

export type EstadoSuscripcion = "en_prueba" | "activo" | "vencido" | "suspendido";

export interface Plan {
  id: string;
  nombre: string;
  precio_mensual: number;
  max_usuarios: number;
  max_sucursales: number;
  activo: boolean;
  creado_en: string;
}

export interface Negocio {
  id: string;
  nombre: string;
  ruc: string | null;
  correo: string | null;
  telefono: string | null;
  creado_en: string;
}

export interface Perfil {
  user_id: string;
  negocio_id: string;
  rol: Rol;
  nombre: string;
  creado_en: string;
}

export interface Suscripcion {
  id: string;
  negocio_id: string;
  plan_id: string | null;
  estado: EstadoSuscripcion;
  inicio_prueba: string | null;
  fin_prueba: string | null;
  fecha_vencimiento: string | null;
  creado_en: string;
}

export interface Pago {
  id: string;
  negocio_id: string;
  monto: number;
  metodo: string;
  referencia: string | null;
  fecha: string;
  confirmado_por: string | null;
  creado_en: string;
}
