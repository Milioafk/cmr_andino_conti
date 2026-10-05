import { registrarUsuario, iniciarSesion } from './auth.js';

function mostrar(el, texto, tipo) {
  el.textContent = texto;
  el.className = 'msg visible ' + tipo;
}
function irSegunRol(usuario) {
  window.location.href = usuario.rol === 'cliente' ? 'registro.html' : 'panel.html';
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg-login');
  const f = e.target;
  try {
    const usuario = await iniciarSesion(f.correo.value.trim(), f.contrasena.value);
    if (!usuario) return mostrar(msg, 'Correo o contraseña incorrectos.', 'error');
    irSegunRol(usuario);
  } catch (err) {
    console.error(err);
    mostrar(msg, 'No se pudo conectar con la base de datos.', 'error');
  }
});

document.getElementById('form-cuenta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg-cuenta');
  const f = e.target;
  try {
    const r = await registrarUsuario(f.nombre.value.trim(), f.correo.value.trim(), f.contrasena.value);
    if (!r.ok) return mostrar(msg, r.error, 'error');
    irSegunRol(r.usuario);
  } catch (err) {
    console.error(err);
    mostrar(msg, 'No se pudo crear la cuenta. Intenta de nuevo.', 'error');
  }
});
