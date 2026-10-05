// UPDATE — el cliente edita solo su propio registro, y solo si sigue 'registrado'
import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

const usuario = exigirSesion(['cliente']);
document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

export async function actualizarRegistro(id, datos) {
  // id_usuario y estado en el WHERE: nadie edita lo ajeno ni lo ya atendido
  const filas = await sql`
    UPDATE solicitudes_demo_crm
    SET nombre = ${datos.nombre}, empresa = ${datos.empresa}, correo = ${datos.correo},
        num_usuarios = ${datos.num_usuarios}, mensaje = ${datos.mensaje}
    WHERE id = ${id} AND id_usuario = ${usuario.id} AND estado = 'registrado'
    RETURNING id;
  `;
  return filas.length > 0;
}

const id = Number(new URLSearchParams(window.location.search).get('id'));
const form = document.getElementById('form-actualizar');
const campos = document.getElementById('campos');
const msg = document.getElementById('mensaje');

function mostrar(texto, tipo) {
  msg.textContent = texto;
  msg.className = 'msg visible ' + tipo;
}

async function cargar() {
  if (!id) { form.hidden = true; return mostrar('No se indicó qué registro editar.', 'error'); }
  try {
    const filas = await sql`
      SELECT * FROM solicitudes_demo_crm WHERE id = ${id} AND id_usuario = ${usuario.id};
    `;
    if (filas.length === 0) { form.hidden = true; return mostrar('No se encontró ese registro.', 'error'); }
    const r = filas[0];
    form.nombre.value = r.nombre;
    form.empresa.value = r.empresa;
    form.correo.value = r.correo;
    form.usuarios.value = r.num_usuarios;
    form.mensaje.value = r.mensaje || '';
    document.getElementById('codigo').textContent = r.codigo_seguimiento;
    if (r.estado !== 'registrado') {
      campos.disabled = true;
      document.getElementById('btn-guardar').hidden = true;
      mostrar('Este registro ya fue atendido (' + r.estado + '); solo puedes verlo.', 'error');
    }
  } catch (err) {
    console.error(err);
    form.hidden = true;
    mostrar('No se pudo cargar el registro.', 'error');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const ok = await actualizarRegistro(id, {
      nombre: form.nombre.value.trim(), empresa: form.empresa.value.trim(),
      correo: form.correo.value.trim(), num_usuarios: form.usuarios.value,
      mensaje: form.mensaje.value.trim()
    });
    mostrar(ok ? '✓ Registro actualizado correctamente.' : 'No se pudo actualizar: el registro ya fue atendido.',
            ok ? 'ok' : 'error');
  } catch (err) {
    console.error(err);
    mostrar('Error al actualizar. Intenta de nuevo.', 'error');
  }
});
cargar();
