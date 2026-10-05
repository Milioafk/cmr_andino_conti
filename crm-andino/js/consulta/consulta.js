// SELECT filtrado — solo los registros del usuario en sesión
import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

const usuario = exigirSesion(['cliente']);
document.getElementById('btn-salir').addEventListener('click', cerrarSesion);
document.getElementById('saludo').textContent = usuario.nombre;

export async function listarPropios() {
  return await sql`
    SELECT id, codigo_seguimiento, empresa, num_usuarios, estado, fecha_registro
    FROM solicitudes_demo_crm
    WHERE id_usuario = ${usuario.id}
    ORDER BY fecha_registro DESC, id DESC;
  `;
}

function td(texto) {
  const c = document.createElement('td');
  c.textContent = texto;
  return c;
}

async function pintar() {
  const cuerpo = document.getElementById('cuerpo');
  const aviso = document.getElementById('aviso');
  try {
    const filas = await listarPropios();
    cuerpo.replaceChildren();
    aviso.textContent = filas.length === 0 ? 'Aún no tienes solicitudes registradas.' : '';
    for (const f of filas) {
      const tr = document.createElement('tr');
      tr.append(td(f.codigo_seguimiento), td(f.empresa), td(f.num_usuarios));
      const est = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'estado estado-' + f.estado;
      badge.textContent = f.estado;
      est.append(badge);
      tr.append(est, td(new Date(f.fecha_registro).toLocaleDateString('es-PE')));
      const acc = document.createElement('td');
      if (f.estado === 'registrado') {
        const a = document.createElement('a');
        a.href = 'actualizar.html?id=' + f.id;
        a.className = 'btn btn-outline btn-sm';
        a.textContent = 'Editar';
        acc.append(a);
      } else {
        acc.textContent = 'Solo lectura';
      }
      tr.append(acc);
      cuerpo.append(tr);
    }
  } catch (err) {
    console.error(err);
    aviso.textContent = 'No se pudieron cargar tus registros.';
  }
}
pintar();
