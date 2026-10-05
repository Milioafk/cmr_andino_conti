-- ===== CRM Andino Perú — Semana 7 — Neon (PostgreSQL) =====
-- Ejecutar en el SQL Editor de Neon, bloque por bloque.

-- 1) Tabla de usuarios con rol (si ya la tienes, el ALTER solo agrega la columna que falte)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(120) NOT NULL UNIQUE,
  contrasena VARCHAR(100) NOT NULL
);
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'cliente'
  CHECK (rol IN ('cliente', 'administrador', 'empleado'));

-- 2) Tabla del caso (si ya la tienes de la Semana 6, solo se agrega id_usuario)
CREATE TABLE IF NOT EXISTS solicitudes_demo_crm (
  id SERIAL PRIMARY KEY,
  codigo_seguimiento VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  empresa VARCHAR(100) NOT NULL,
  correo VARCHAR(120) NOT NULL,
  num_usuarios VARCHAR(10) NOT NULL DEFAULT '1-3',
  mensaje TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'registrado',
  fecha_registro TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE solicitudes_demo_crm ADD COLUMN IF NOT EXISTS id_usuario INT REFERENCES usuarios(id);

-- 2b) NUEVO (Semana 7): turnos de trabajo, estado del empleado y gestor de cada solicitud.
--     Turnos (hora de Lima): dia 06:00-14:00 · tarde 14:00-22:00 · noche 22:00-06:00
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS turno VARCHAR(10) CHECK (turno IN ('dia', 'tarde', 'noche'));
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE solicitudes_demo_crm ADD COLUMN IF NOT EXISTS turno VARCHAR(10) CHECK (turno IN ('dia', 'tarde', 'noche'));
ALTER TABLE solicitudes_demo_crm ADD COLUMN IF NOT EXISTS id_empleado INT REFERENCES usuarios(id) ON DELETE SET NULL;
-- Un solo empleado por turno (3 empleados = 3 turnos)
CREATE UNIQUE INDEX IF NOT EXISTS ux_empleado_por_turno ON usuarios (turno) WHERE rol = 'empleado';

-- Convierte una hora (0-23) en el nombre del turno
CREATE OR REPLACE FUNCTION turno_de_hora(h INT) RETURNS VARCHAR LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN h >= 6 AND h < 14 THEN 'dia'
              WHEN h >= 14 AND h < 22 THEN 'tarde'
              ELSE 'noche' END
$$;

-- ¿Está vigente ese turno ahora mismo en Lima? (lo usa el panel para permitir o bloquear cambios)
CREATE OR REPLACE FUNCTION en_turno(t VARCHAR) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT turno_de_hora(EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Lima'))::INT) = t
$$;

-- Toda solicitud nueva (de un cliente o presencial) queda asignada al turno en que se registró
-- y al empleado de ese turno, sin tocar registro.js.
CREATE OR REPLACE FUNCTION asignar_turno() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.turno IS NULL THEN
    NEW.turno := turno_de_hora(EXTRACT(HOUR FROM ((NEW.fecha_registro AT TIME ZONE 'UTC') AT TIME ZONE 'America/Lima'))::INT);
  END IF;
  IF NEW.id_empleado IS NULL THEN
    SELECT id INTO NEW.id_empleado FROM usuarios WHERE rol = 'empleado' AND turno = NEW.turno LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_asignar_turno ON solicitudes_demo_crm;
CREATE TRIGGER trg_asignar_turno BEFORE INSERT ON solicitudes_demo_crm
  FOR EACH ROW EXECUTE FUNCTION asignar_turno();

-- 3) REINICIO + datos de prueba: 10 clientes (3 solicitudes c/u = 30), 1 administrador y 3 empleados (uno por turno).
--    Contraseña de todas las cuentas: 1234. Se puede ejecutar las veces que quieras.
TRUNCATE solicitudes_demo_crm, usuarios RESTART IDENTITY CASCADE;

-- Personal: 1 administrador y 3 empleados, uno por turno (se inserta aparte para que el trigger los encuentre)
INSERT INTO usuarios (nombre, correo, contrasena, rol, turno) VALUES
  ('Admin de prueba',      'admin@correo.com',     '1234', 'administrador', NULL),
  ('Diego Ramos Quispe',   'empleado1@correo.com', '1234', 'empleado',      'dia'),
  ('Valeria Soto Medina',  'empleado2@correo.com', '1234', 'empleado',      'tarde'),
  ('Marco Cáceres Luna',   'empleado3@correo.com', '1234', 'empleado',      'noche');

WITH clientes (nombre, correo, empresa, num_usuarios, mensaje) AS (
 VALUES
 ('Carlos Quispe Huamán',        'carlos.quispe@gmail.com',      'Distribuidora Andina del Sur S.A.C.',       '4-10', 'Somos 6 vendedores y manejamos los pedidos por WhatsApp. Queremos ordenar el seguimiento de clientes.'),
 ('María Fernanda Rojas Torres', 'maria.rojas@hotmail.com',      'Inmobiliaria Los Cedros S.A.C.',            '4-10', 'Necesitamos controlar a los interesados en departamentos y saber quién los contactó.'),
 ('José Luis Mamani Condori',    'jose.mamani@gmail.com',        'Transportes Titicaca E.I.R.L.',             '1-3',  'Cotizamos fletes por llamada y se nos pierden los clientes.'),
 ('Rosa Elena Flores Vargas',    'rosa.flores@outlook.com',      'Clínica Dental Sonrisas del Sol',           '1-3',  'Queremos recordar a los pacientes sus citas de control y tratamientos pendientes.'),
 ('Luis Alberto Chávez Paredes', 'luis.chavez@gmail.com',        'Ferretería El Constructor S.R.L.',          '4-10', 'Atendemos obras y empresas; queremos el historial de cada cliente y sus cotizaciones.'),
 ('Ana Lucía Gutiérrez Salas',   'ana.gutierrez@hotmail.com',    'Agencia de Viajes Machu Picchu Tours',      '4-10', 'Recibimos consultas por correo y WhatsApp y no sabemos cuáles se concretaron.'),
 ('Jorge Luis Huamán Ccori',     'jorge.huaman@gmail.com',       'Agroexportadora Valle Sagrado S.A.C.',      '11+',  'Tenemos compradores en varios países y queremos un solo registro de contactos.'),
 ('Patricia Vásquez Ramos',      'patricia.vasquez@outlook.com', 'Academia Preuniversitaria Nuevo Horizonte', '4-10', 'Gestionamos postulantes y matrículas; necesitamos seguimiento de cada interesado.'),
 ('Miguel Ángel Ccama Apaza',    'miguel.ccama@gmail.com',       'Importaciones Pacífico S.A.C.',             '4-10', 'Importamos repuestos y queremos reportes de ventas por vendedor.'),
 ('Karen Milagros Díaz Soto',    'karen.diaz@hotmail.com',       'Boutique Flor de Lima',                     '1-3',  'Vendemos por redes sociales y quisiera ordenar a mis clientas frecuentes.')
),
nuevos AS (
  INSERT INTO usuarios (nombre, correo, contrasena, rol)
  SELECT nombre, correo, '1234', 'cliente' FROM clientes
  RETURNING id, correo
)
INSERT INTO solicitudes_demo_crm
  (id_usuario, codigo_seguimiento, nombre, empresa, correo, num_usuarios, mensaje, estado, fecha_registro)
SELECT n.id,
       'COD-' || lpad((n.id * 10 + s)::text, 8, '0'),
       c.nombre, c.empresa, c.correo, c.num_usuarios,
       CASE s WHEN 1 THEN c.mensaje
              WHEN 2 THEN 'Segunda demo para el área comercial de ' || c.empresa
              ELSE 'Consulta sobre planes y precios para ' || c.empresa END,
       CASE WHEN s = 1 THEN 'registrado' ELSE 'atendido' END,
       NOW() - make_interval(hours => n.id * 5 + (4 - s) * 20)
FROM clientes c
JOIN nuevos n ON n.correo = c.correo
CROSS JOIN generate_series(1, 3) AS s;

-- 4) Verificación para la captura de la entrega: cliente 10, administrador 1, empleado 3 y 30 registros
SELECT rol, COUNT(*) FROM usuarios GROUP BY rol;
SELECT COUNT(*) AS total_registros FROM solicitudes_demo_crm;
SELECT id_usuario, COUNT(*) AS registros FROM solicitudes_demo_crm GROUP BY id_usuario ORDER BY id_usuario;
SELECT turno, COUNT(*) AS solicitudes FROM solicitudes_demo_crm GROUP BY turno ORDER BY turno;
SELECT nombre, correo, turno, activo FROM usuarios WHERE rol = 'empleado' ORDER BY id;
