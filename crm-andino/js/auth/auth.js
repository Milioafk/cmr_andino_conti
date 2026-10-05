// Cuentas y sesión
import { sql } from '../config/neon-config.js';

// Crea siempre una cuenta con rol 'cliente' (admin y empleado se insertan por SQL)
export async function registrarUsuario(nombre, correo, contrasena) {
  const existe = await sql`SELECT id FROM usuarios WHERE correo = ${correo};`;
  if (existe.length > 0) return { ok: false, error: 'Ese correo ya tiene una cuenta.' };
  const filas = await sql`
    INSERT INTO usuarios (nombre, correo, contrasena, rol)
    VALUES (${nombre}, ${correo}, ${contrasena}, 'cliente')
    RETURNING id, nombre, rol;
  `;
  sessionStorage.setItem('usuario', JSON.stringify(filas[0]));
  return { ok: true, usuario: filas[0] };
}

export async function iniciarSesion(correo, contrasena) {
  const filas = await sql`
    SELECT id, nombre, rol FROM usuarios
    WHERE correo = ${correo} AND contrasena = ${contrasena};
  `;
  if (filas.length === 0) return null;
  sessionStorage.setItem('usuario', JSON.stringify(filas[0]));
  return filas[0];
}

export function cerrarSesion() {
  sessionStorage.removeItem('usuario');
  window.location.href = 'login.html';
}

// Protege una página: sin sesión -> login; rol no permitido -> su página propia.
// Si redirige, lanza un error para que el resto del script no se ejecute.
export function exigirSesion(rolesPermitidos = ['cliente', 'administrador', 'empleado']) {
  let usuario = null;
  try { usuario = JSON.parse(sessionStorage.getItem('usuario')); } catch { usuario = null; }
  if (!usuario) {
    window.location.href = 'login.html';
    throw new Error('Sin sesión');
  }
  if (!rolesPermitidos.includes(usuario.rol)) {
    window.location.href = usuario.rol === 'cliente' ? 'registro.html' : 'panel.html';
    throw new Error('Rol no permitido');
  }
  return usuario;
}
