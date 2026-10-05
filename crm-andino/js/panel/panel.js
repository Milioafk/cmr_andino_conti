// Panel de administrador / empleado — Semana 7
//  · Administrador: CRUD sobre TODAS las solicitudes, cambia estados, reasigna turnos y activa/desactiva empleados.
//  · Empleado (3, uno por turno: día, tarde, noche): CRUD solo de las solicitudes de SU turno
//    y únicamente mientras su turno está vigente (hora de Lima). Fuera de turno solo consulta.
import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

// Un cliente es redirigido a registro.html automáticamente
const usuario = exigirSesion(['administrador', 'empleado']);
const esAdmin = usuario.rol === 'administrador';
document.getElementById('btn-salir').addEventListener('click', cerrarSesion);
document.getElementById('rol-etiqueta').textContent = 'Panel de ' + usuario.rol + ' — ' + usuario.nombre;

/* ============================================================
   Turnos y hora de Lima
   ============================================================ */
const TURNOS = {
  dia:   { nombre: 'Día',   horas: '06:00 – 14:00', icono: '☀️' },
  tarde: { nombre: 'Tarde', horas: '14:00 – 22:00', icono: '🌇' },
  noche: { nombre: 'Noche', horas: '22:00 – 06:00', icono: '🌙' }
};

const fmtLima = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});
function ahoraLima() {
  const p = fmtLima.formatToParts(new Date());
  const n = (t) => Number(p.find((x) => x.type === t).value);
  return { h: n('hour') % 24, m: n('minute'), s: n('second') };
}
function turnoDeHora(h) {
  if (h >= 6 && h < 14) return 'dia';
  if (h >= 14 && h < 22) return 'tarde';
  return 'noche';
}
const dos = (n) => String(n).padStart(2, '0');

/* ============================================================
   Estado de la pantalla
   ============================================================ */
let miTurno = null;      // solo empleados
let miActivo = true;     // solo empleados (lo controla el administrador)
let filas = [];
let equipo = [];
let editandoId = null;
let filtroTurno = 'todos';
let turnoVigente = turnoDeHora(ahoraLima().h);

const enTurno = () => turnoVigente === miTurno;
// Un empleado puede crear/editar/eliminar solo si su cuenta está activa y su turno está vigente
const empleadoPuede = () => miActivo && enTurno();
const puedoCrear = () => esAdmin || empleadoPuede();
const puedoModificar = (r) => esAdmin || (empleadoPuede() && r.turno === miTurno);

/* ============================================================
   Acceso a datos
   ============================================================ */
// Consultar — administrador: todos, sin filtro por usuario
export async function listarTodos() {
  return await sql`
    SELECT s.*, e.nombre AS gestor
    FROM solicitudes_demo_crm s
    LEFT JOIN usuarios e ON e.id = s.id_empleado
    ORDER BY s.fecha_registro DESC, s.id DESC;
  `;
}

// Consultar — empleado: solo las de su turno
export async function listarDelTurno(turno) {
  return await sql`
    SELECT s.*, e.nombre AS gestor
    FROM solicitudes_demo_crm s
    LEFT JOIN usuarios e ON e.id = s.id_empleado
    WHERE s.turno = ${turno}
    ORDER BY s.fecha_registro DESC, s.id DESC;
  `;
}

export async function listarEquipo() {
  return await sql`
    SELECT u.id, u.nombre, u.correo, u.turno, u.activo,
           (SELECT COUNT(*) FROM solicitudes_demo_crm s WHERE s.turno = u.turno)::int AS total
    FROM usuarios u
    WHERE u.rol = 'empleado'
    ORDER BY CASE u.turno WHEN 'dia' THEN 1 WHEN 'tarde' THEN 2 ELSE 3 END;
  `;
}

// Administrador: activar / desactivar a un empleado
export async function cambiarActivo(id, activo) {
  await sql`UPDATE usuarios SET activo = ${activo} WHERE id = ${id} AND rol = 'empleado';`;
}

// Crear — administrador: atención presencial/telefónica (id_usuario NULL), con el turno que elija
export async function crearRegistro(datos) {
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  const turno = datos.turno || turnoVigente;
  await sql`
    INSERT INTO solicitudes_demo_crm
      (codigo_seguimiento, nombre, empresa, correo, num_usuarios, mensaje, estado, turno, id_empleado)
    VALUES
      (${codigo}, ${datos.nombre}, ${datos.empresa}, ${datos.correo}, ${datos.num_usuarios}, ${datos.mensaje},
       ${datos.estado || 'registrado'}, ${turno},
       (SELECT id FROM usuarios WHERE rol = 'empleado' AND turno = ${turno} LIMIT 1));
  `;
  return codigo;
}

// Crear — empleado: la base de datos verifica cuenta activa + turno vigente; se asigna a su turno y a él
export async function crearComoEmpleado(datos) {
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  const r = await sql`
    INSERT INTO solicitudes_demo_crm
      (codigo_seguimiento, nombre, empresa, correo, num_usuarios, mensaje, estado, turno, id_empleado)
    SELECT ${codigo}::varchar, ${datos.nombre}::varchar, ${datos.empresa}::varchar, ${datos.correo}::varchar,
           ${datos.num_usuarios}::varchar, ${datos.mensaje}::text,
           CASE WHEN ${datos.estado}::varchar IN ('registrado', 'atendido') THEN ${datos.estado}::varchar ELSE 'registrado' END,
           u.turno, u.id
    FROM usuarios u
    WHERE u.id = ${usuario.id} AND u.rol = 'empleado' AND u.activo AND en_turno(u.turno)
    RETURNING id;
  `;
  return r.length > 0 ? codigo : null;
}

// Actualizar — administrador: cualquier registro, incluido el estado y el turno/gestor
export async function actualizarComoPanel(id, datos) {
  const turno = datos.turno || turnoVigente;
  await sql`
    UPDATE solicitudes_demo_crm
    SET nombre = ${datos.nombre}, empresa = ${datos.empresa}, correo = ${datos.correo},
        num_usuarios = ${datos.num_usuarios}, mensaje = ${datos.mensaje}, estado = ${datos.estado},
        turno = ${turno},
        id_empleado = (SELECT id FROM usuarios WHERE rol = 'empleado' AND turno = ${turno} LIMIT 1)
    WHERE id = ${id};
  `;
}

// Actualizar — administrador: solo el estado (desde la tabla)
export async function cambiarEstado(id, estado) {
  await sql`UPDATE solicitudes_demo_crm SET estado = ${estado} WHERE id = ${id};`;
}

// Actualizar — empleado: solo registros de su turno, con turno vigente y cuenta activa.
// Solo puede dejar 'registrado' o 'atendido'; 'rechazado' queda reservado al administrador.
export async function actualizarComoEmpleado(id, datos) {
  const r = await sql`
    UPDATE solicitudes_demo_crm s
    SET nombre = ${datos.nombre}, empresa = ${datos.empresa}, correo = ${datos.correo},
        num_usuarios = ${datos.num_usuarios}, mensaje = ${datos.mensaje},
        estado = CASE WHEN ${datos.estado}::varchar IN ('registrado', 'atendido') THEN ${datos.estado}::varchar ELSE s.estado END
    WHERE s.id = ${id}
      AND EXISTS (SELECT 1 FROM usuarios u
                  WHERE u.id = ${usuario.id} AND u.rol = 'empleado' AND u.activo
                    AND u.turno = s.turno AND en_turno(u.turno))
    RETURNING s.id;
  `;
  return r.length > 0;
}

// Eliminar — administrador: la interfaz pide confirmación antes de llamarla
export async function eliminarRegistro(id) {
  await sql`DELETE FROM solicitudes_demo_crm WHERE id = ${id};`;
}

// Eliminar — empleado: mismas reglas que actualizar
export async function eliminarComoEmpleado(id) {
  const r = await sql`
    DELETE FROM solicitudes_demo_crm s
    WHERE s.id = ${id}
      AND EXISTS (SELECT 1 FROM usuarios u
                  WHERE u.id = ${usuario.id} AND u.rol = 'empleado' AND u.activo
                    AND u.turno = s.turno AND en_turno(u.turno))
    RETURNING s.id;
  `;
  return r.length > 0;
}

/* ============================================================
   Utilidades de interfaz
   ============================================================ */
const form = document.getElementById('form-panel');
const cuerpo = document.getElementById('cuerpo');
const msg = document.getElementById('mensaje');
const btnCancelar = document.getElementById('btn-cancelar');
const fieldset = form.querySelector('fieldset');
const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let msgTimer;
function mostrar(texto, tipo) {
  msg.textContent = texto;
  msg.className = 'msg visible ' + tipo;
  msg.style.animation = 'none'; void msg.offsetWidth; msg.style.animation = '';   // reinicia la animación
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { msg.className = 'msg'; }, 6000);
}
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
function td(texto) {
  const c = document.createElement('td');
  c.textContent = texto;
  return c;
}
function turnoBadge(turno) {
  const t = TURNOS[turno];
  return el('span', 'turno-badge t-' + turno, t ? t.icono + ' ' + t.nombre : 'Sin turno');
}
function animarNumero(nodo, hasta) {
  const desde = Number(nodo.textContent) || 0;
  if (desde === hasta) return;
  if (sinMovimiento) { nodo.textContent = hasta; return; }
  const t0 = performance.now(), dur = 700;
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    nodo.textContent = Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/* ============================================================
   Reloj, línea de turnos y avisos
   ============================================================ */
const reloj = document.getElementById('reloj');
const marcador = document.getElementById('marcador');
const lineaTurnos = document.getElementById('linea-turnos');
const avisoTurno = document.getElementById('aviso-turno');

function pintarLinea() {
  lineaTurnos.querySelectorAll('.seg').forEach((s) => {
    const t = ['dia', 'tarde', 'noche'].find((k) => s.classList.contains('seg-' + k));
    s.classList.toggle('vigente', t === turnoVigente);
    s.classList.toggle('mio', !esAdmin && t === miTurno);
  });
  const info = TURNOS[turnoVigente];
  document.getElementById('turno-actual').replaceChildren(
    'Turno vigente: ', el('b', '', info.icono + ' ' + info.nombre + ' (' + info.horas + ')')
  );
}

function pintarAviso() {
  if (esAdmin) { avisoTurno.hidden = true; return; }
  avisoTurno.hidden = false;
  avisoTurno.replaceChildren(el('span', 'punto'));
  const t = TURNOS[miTurno];
  if (!miActivo) {
    avisoTurno.className = 'aviso-turno bloqueado';
    avisoTurno.append('Tu cuenta fue desactivada por el administrador: solo puedes consultar.');
  } else if (enTurno()) {
    avisoTurno.className = 'aviso-turno en-turno';
    avisoTurno.append('Estás en tu turno (' + t.nombre + '): puedes crear, editar y eliminar las solicitudes de tu turno.');
  } else {
    avisoTurno.className = 'aviso-turno fuera';
    avisoTurno.append('Fuera de turno. Tu horario es ' + t.nombre + ' (' + t.horas + '): por ahora solo puedes consultar.');
  }
}

function aplicarPermisosFormulario() {
  fieldset.disabled = !puedoCrear();
}

function tick() {
  const { h, m, s } = ahoraLima();
  reloj.textContent = dos(h) + ':' + dos(m) + ':' + dos(s);
  marcador.style.left = ((h * 3600 + m * 60 + s) / 86400) * 100 + '%';
  const nuevo = turnoDeHora(h);
  if (nuevo !== turnoVigente) {          // cambió el turno: se actualizan los permisos sin recargar
    turnoVigente = nuevo;
    pintarLinea(); pintarAviso(); aplicarPermisosFormulario();
    if (esAdmin) pintarEquipo();
    render();
    mostrar('Cambió el turno: ahora es el turno ' + TURNOS[nuevo].nombre + '.', 'ok');
  }
}

/* ============================================================
   Equipo (solo administrador)
   ============================================================ */
function pintarEquipo() {
  const cont = document.getElementById('equipo');
  cont.replaceChildren();
  equipo.forEach((e, i) => {
    const t = TURNOS[e.turno] || { nombre: 'Sin turno', horas: '', icono: '' };
    const vigente = e.turno === turnoVigente && e.activo;
    const card = el('div', 'emp t-' + e.turno + (vigente ? ' vigente' : '') + (e.activo ? '' : ' inactivo'));
    card.style.setProperty('--i', i);
    card.append(el('div', 'emp-turno', t.icono + ' Turno ' + t.nombre + ' · ' + t.horas));
    card.append(el('div', 'emp-nombre', e.nombre));
    card.append(el('div', 'emp-mail', e.correo));
    const pie = el('div', 'emp-pie');
    const estado = el('span', 'emp-estado', !e.activo ? 'Desactivado' : (e.turno === turnoVigente ? '● En turno ahora' : 'Fuera de turno'));
    const label = el('label', 'switch');
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.checked = e.activo;
    chk.setAttribute('aria-label', 'Empleado ' + e.nombre + ' activo');
    label.append(chk, el('span', 'pista'), el('span', '', e.activo ? 'Activo' : 'Inactivo'));
    chk.addEventListener('change', async () => {
      chk.disabled = true;
      try {
        await cambiarActivo(e.id, chk.checked);
        e.activo = chk.checked;
        mostrar('✓ ' + e.nombre + (e.activo ? ' fue activado.' : ' fue desactivado: solo podrá consultar.'), 'ok');
        pintarEquipo();
      } catch (err) {
        console.error(err); chk.checked = !chk.checked; chk.disabled = false;
        mostrar('No se pudo cambiar el estado del empleado.', 'error');
      }
    });
    pie.append(estado, label);
    card.append(pie, el('div', 'emp-total', e.total + ' solicitudes en su turno'));
    cont.append(card);
  });
}

/* ============================================================
   Formulario
   ============================================================ */
if (!esAdmin) form.estado.querySelector('option[value="rechazado"]').disabled = true;  // rechazar es del administrador
if (esAdmin) document.getElementById('campo-turno').hidden = false;

function salirDeEdicion() {
  editandoId = null;
  form.reset();
  if (esAdmin) form.turno.value = turnoVigente;
  document.getElementById('titulo-form').textContent = 'Nueva solicitud (atención presencial)';
  document.getElementById('btn-guardar').textContent = 'Crear solicitud';
  btnCancelar.hidden = true;
}
function editar(r) {
  editandoId = r.id;
  form.nombre.value = r.nombre;
  form.empresa.value = r.empresa;
  form.correo.value = r.correo;
  form.usuarios.value = r.num_usuarios;
  form.mensaje.value = r.mensaje || '';
  form.estado.value = r.estado;
  if (esAdmin) form.turno.value = r.turno || turnoVigente;
  document.getElementById('titulo-form').textContent = 'Editando ' + r.codigo_seguimiento;
  document.getElementById('btn-guardar').textContent = 'Guardar cambios';
  btnCancelar.hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
  form.classList.remove('editando'); void form.offsetWidth; form.classList.add('editando');
}

/* ============================================================
   Tabla
   ============================================================ */
function visibles() {
  const q = document.getElementById('buscar').value.trim().toLowerCase();
  const est = document.getElementById('filtro-estado').value;
  return filas.filter((r) =>
    (filtroTurno === 'todos' || r.turno === filtroTurno) &&
    (!est || r.estado === est) &&
    (!q || [r.nombre, r.empresa, r.codigo_seguimiento, r.correo].some((v) => String(v).toLowerCase().includes(q)))
  );
}

function pintarStats() {
  const c = { total: filas.length, registrado: 0, atendido: 0, rechazado: 0 };
  for (const r of filas) c[r.estado] = (c[r.estado] || 0) + 1;
  document.querySelectorAll('#stats .stat-num').forEach((n) => animarNumero(n, c[n.dataset.k] || 0));
}

function celdaEstado(r) {
  const est = document.createElement('td');
  if (!esAdmin) { est.append(el('span', 'estado estado-' + r.estado, r.estado)); return est; }
  // El administrador cambia el estado de cualquier solicitud directo desde la tabla
  const sel = el('select', 'estado-select estado-' + r.estado);
  sel.setAttribute('aria-label', 'Estado de ' + r.codigo_seguimiento);
  for (const e of ['registrado', 'atendido', 'rechazado']) {
    const o = el('option', '', e); o.value = e; sel.append(o);
  }
  sel.value = r.estado;
  sel.addEventListener('change', async () => {
    try {
      await cambiarEstado(r.id, sel.value);
      r.estado = sel.value;
      sel.className = 'estado-select estado-' + r.estado;
      const fila = sel.closest('tr');
      fila.classList.remove('fila', 'fila-flash'); void fila.offsetWidth; fila.classList.add('fila-flash');
      pintarStats();
      mostrar('✓ ' + r.codigo_seguimiento + ' ahora está "' + r.estado + '".', 'ok');
    } catch (err) { console.error(err); sel.value = r.estado; mostrar('No se pudo cambiar el estado.', 'error'); }
  });
  est.append(sel);
  return est;
}

function render() {
  const lista = visibles();
  const resto = lista.length !== filas.length ? ' · mostrando ' + lista.length : '';
  cuerpo.replaceChildren();
  document.getElementById('total').textContent = esAdmin
    ? filas.length + ' solicitudes en total' + resto
    : filas.length + ' solicitudes en tu turno (' + TURNOS[miTurno].nombre + ')' + resto;
  document.querySelector('.tabla-scroll caption').textContent = esAdmin
    ? 'Todas las solicitudes de demo'
    : 'Solicitudes de demo del turno ' + TURNOS[miTurno].nombre;

  if (lista.length === 0) {
    const tr = el('tr', 'tabla-vacia');
    const c = el('td', '', 'No hay solicitudes con esos filtros.');
    c.colSpan = 10;
    tr.append(c); cuerpo.append(tr);
    return;
  }

  lista.forEach((r, i) => {
    const tr = el('tr', 'fila');
    tr.style.setProperty('--i', Math.min(i, 20));
    tr.append(td(r.codigo_seguimiento), td(r.nombre), td(r.empresa), td(r.correo), td(r.num_usuarios));
    tr.append(celdaEstado(r));
    tr.append(td(r.id_usuario ? 'Usuario #' + r.id_usuario : 'Presencial'));
    const tdT = document.createElement('td'); tdT.append(turnoBadge(r.turno)); tr.append(tdT);
    tr.append(td(r.gestor || '—'));

    const acc = el('td', 'acciones');
    const bE = el('button', 'btn btn-outline btn-sm', 'Editar');
    bE.type = 'button';
    const bD = el('button', 'btn btn-peligro btn-sm', 'Eliminar');
    bD.type = 'button';
    if (!puedoModificar(r)) {
      bE.disabled = bD.disabled = true;
      bE.title = bD.title = !miActivo ? 'Tu cuenta está desactivada' : 'Solo puedes modificar durante tu turno';
    }
    bE.addEventListener('click', () => editar(r));
    bD.addEventListener('click', async () => {
      if (!confirm('¿Eliminar la solicitud ' + r.codigo_seguimiento + '? Esta acción no se puede deshacer.')) return;
      try {
        if (esAdmin) await eliminarRegistro(r.id);
        else if (!(await eliminarComoEmpleado(r.id))) return mostrar('No se pudo eliminar: ya no estás en tu turno.', 'error');
        if (editandoId === r.id) salirDeEdicion();
        tr.classList.remove('fila'); tr.classList.add('fila-sale');
        mostrar('✓ Solicitud eliminada.', 'ok');
        setTimeout(pintar, sinMovimiento ? 0 : 380);
      } catch (err) { console.error(err); mostrar('No se pudo eliminar.', 'error'); }
    });
    acc.append(bE, bD);
    tr.append(acc);
    cuerpo.append(tr);
  });
}

function esqueleto() {
  cuerpo.replaceChildren();
  for (let i = 0; i < 4; i++) {
    const tr = el('tr', 'cargando');
    const c = document.createElement('td'); c.colSpan = 10; c.append(el('div', 'brillo'));
    tr.append(c); cuerpo.append(tr);
  }
}

async function pintar() {
  try {
    filas = esAdmin ? await listarTodos() : await listarDelTurno(miTurno);
    if (esAdmin) { equipo = await listarEquipo(); pintarEquipo(); }
    pintarStats();
    render();
  } catch (err) {
    console.error(err);
    cuerpo.replaceChildren();
    mostrar('No se pudieron cargar las solicitudes. ¿Ya ejecutaste el SQL actualizado en Neon?', 'error');
  }
}

/* ============================================================
   Eventos
   ============================================================ */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    nombre: form.nombre.value.trim(), empresa: form.empresa.value.trim(),
    correo: form.correo.value.trim(), num_usuarios: form.usuarios.value,
    mensaje: form.mensaje.value.trim(), estado: form.estado.value,
    turno: esAdmin ? form.turno.value : miTurno
  };
  try {
    if (esAdmin) {
      if (editandoId) { await actualizarComoPanel(editandoId, datos); mostrar('✓ Solicitud actualizada.', 'ok'); }
      else { const codigo = await crearRegistro(datos); mostrar('✓ Solicitud creada. Código: ' + codigo, 'ok'); }
    } else if (editandoId) {
      if (!(await actualizarComoEmpleado(editandoId, datos))) return mostrar('No se pudo actualizar: solo puedes modificar durante tu turno.', 'error');
      mostrar('✓ Solicitud actualizada.', 'ok');
    } else {
      const codigo = await crearComoEmpleado(datos);
      if (!codigo) return mostrar('No se pudo crear: solo puedes crear durante tu turno.', 'error');
      mostrar('✓ Solicitud creada. Código: ' + codigo, 'ok');
    }
    salirDeEdicion();
    pintar();
  } catch (err) { console.error(err); mostrar('No se pudo guardar.', 'error'); }
});
btnCancelar.addEventListener('click', salirDeEdicion);

document.getElementById('chips-turno').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  filtroTurno = b.dataset.turno;
  document.querySelectorAll('#chips-turno .chip').forEach((c) => c.classList.toggle('activo', c === b));
  render();
});
document.getElementById('filtro-estado').addEventListener('change', render);
document.getElementById('buscar').addEventListener('input', render);

/* ============================================================
   Arranque
   ============================================================ */
async function iniciar() {
  esqueleto();
  if (esAdmin) {
    document.getElementById('equipo-wrap').hidden = false;
    document.getElementById('chips-turno').hidden = false;
  } else {
    // El turno y el estado del empleado se leen de la base de datos (no del navegador)
    try {
      const r = await sql`SELECT turno, activo FROM usuarios WHERE id = ${usuario.id} AND rol = 'empleado';`;
      if (r.length === 0 || !r[0].turno) {
        cuerpo.replaceChildren();
        return mostrar('Tu cuenta no tiene un turno asignado. Pídele al administrador que la configure.', 'error');
      }
      miTurno = r[0].turno; miActivo = r[0].activo;
    } catch (err) {
      console.error(err);
      cuerpo.replaceChildren();
      return mostrar('No se pudo leer tu turno. ¿Ya ejecutaste el SQL actualizado en Neon?', 'error');
    }
  }
  pintarLinea(); pintarAviso(); tick();
  salirDeEdicion();
  aplicarPermisosFormulario();
  setInterval(tick, 1000);
  pintar();
}
iniciar();
