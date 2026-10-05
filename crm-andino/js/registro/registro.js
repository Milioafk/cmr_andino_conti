// INSERT — el cliente registra su solicitud de demo
import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

const usuario = exigirSesion(['cliente']);
document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

export async function registrarSolicitud(datos) {
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  await sql`
    INSERT INTO solicitudes_demo_crm
      (id_usuario, codigo_seguimiento, nombre, empresa, correo, num_usuarios, mensaje, estado)
    VALUES
      (${usuario.id}, ${codigo}, ${datos.nombre}, ${datos.empresa}, ${datos.correo},
       ${datos.num_usuarios}, ${datos.mensaje}, 'registrado');
  `;
  return codigo;
}

const form = document.getElementById('form-registro');
const msg = document.getElementById('mensaje');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const codigo = await registrarSolicitud({
      nombre: form.nombre.value.trim(),
      empresa: form.empresa.value.trim(),
      correo: form.correo.value.trim(),
      num_usuarios: form.usuarios.value,
      mensaje: form.mensaje.value.trim()
    });
    msg.textContent = '✓ ¡Gracias! Recibimos tu solicitud. Código de seguimiento: ' + codigo;
    msg.className = 'msg visible ok';
    form.reset();
  } catch (err) {
    console.error(err);
    msg.textContent = 'No se pudo guardar la solicitud. Intenta de nuevo.';
    msg.className = 'msg visible error';
  }
});
