CREATE TABLE transversales.planillas_aportes (
	id_planilla_aportes serial4 NOT NULL,
	cod_patronal varchar(200) NOT NULL,
	total_importe numeric(18, 6) NOT NULL,
	estado int2 DEFAULT '1'::smallint NOT NULL,
	usuario_creacion varchar(255) DEFAULT SESSION_USER NOT NULL,
	fecha_creacion timestamp DEFAULT now() NOT NULL,
	usuario_modificacion varchar(255) NULL,
	fecha_modificacion timestamp NULL,
	observaciones text NULL,
	com_nro int4 DEFAULT nextval('transversales.seq_comprobante'::regclass) NULL,
	total_trabaj int4 NOT NULL,
	fecha_planilla date NULL,
	fecha_declarada timestamp NULL,
	fecha_pago timestamp NULL,
	aporte_porcentaje numeric(18, 6) NULL,
	ufv_dia_formal numeric(18, 6) NULL,
	ufv_dia_presentacion numeric(18, 6) NULL,
	aporte_actualizado numeric(18, 6) NULL,
	monto_actualizado numeric(18, 6) NULL,
	multa_no_presentacion numeric(18, 6) NULL,
	dias_retraso int4 NULL,
	intereses numeric(18, 6) NULL,
	multa_sobre_intereses numeric(18, 6) NULL,
	total_a_cancelar numeric(18, 6) NULL,
	total_multas numeric(18, 6) NULL,
	total_tasa_interes numeric(18, 6) NULL,
	total_aportes_asuss numeric(18, 6) NULL,
	total_aportes_min_salud numeric(18, 6) NULL,
	mes varchar(255) NULL,
	gestion varchar(255) NULL,
	total_a_cancelar_parcial numeric(18, 6) NULL,
	id_empresa int4 NULL,
	tipo_planilla varchar(255) NULL,
	fecha_liquidacion timestamp NULL,
	total_deducciones numeric(18, 6) DEFAULT 0 NULL,
	aplica_descuento_min_salud bool DEFAULT false NULL,
	otros_descuentos numeric(18, 6) DEFAULT 0 NULL,
	motivo_otros_descuentos text NULL,
	excedente numeric(18, 6) DEFAULT 0 NULL,
	motivo_excedente text NULL,
	nombre_creacion varchar(255) NULL,
	cotizacion_tasa numeric(18, 6) NULL,
	id_planilla_origen int8 NULL,
	fecha_presentacion_oficial timestamp NULL,
	fecha_deposito_presentacion timestamp NULL,
	valido_cotizacion varchar(200) NULL,
	cotizacion_tasa_real numeric(18, 6) NULL,
	fecha_verificacion_afiliacion timestamp NULL,
	CONSTRAINT planillas_aportes_pkey PRIMARY KEY (id_planilla_aportes),
	CONSTRAINT fk_planillas_aportes_empresa FOREIGN KEY (id_empresa) REFERENCES transversales.empresa(id_empresa)
);

CREATE TABLE transversales.planilla_aportes_detalles (
	id_planilla_aportes_detalles serial4 NOT NULL,
	id_planilla_aportes int8 NOT NULL,
	nro int8 NULL,
	ci varchar(20) NULL,
	apellido_paterno varchar(255) NULL,
	apellido_materno varchar(255) NULL,
	nombres varchar(255) NULL,
	sexo varchar(10) NULL,
	cargo varchar(255) NULL,
	fecha_nac date NULL,
	fecha_ingreso date NULL,
	fecha_retiro date NULL,
	dias_pagados int4 NULL,
	salario numeric(18, 6) NULL,
	fecha_registro timestamp DEFAULT now() NULL,
	usuario_creacion varchar(255) DEFAULT SESSION_USER NOT NULL,
	fecha_creacion timestamp DEFAULT now() NOT NULL,
	usuario_modificacion varchar(100) NULL,
	fecha_modificacion timestamp NULL,
	regional varchar(255) NULL,
	haber_basico numeric(18, 6) NULL,
	bono_antiguedad numeric(18, 6) NULL,
	monto_horas_extra numeric(18, 6) NULL,
	monto_horas_extra_nocturnas numeric(18, 6) NULL,
	otros_bonos_pagos numeric(18, 6) NULL,
	tipo varchar(20) NULL,
	matricula varchar(20) NULL,
	tipo_afiliado varchar(30) NULL,
	asegurado_tipo varchar(30) NULL,
	asegurado_estado varchar(30) NULL,
	observaciones_afiliacion varchar(255) NULL,
	CONSTRAINT planillas_aportes_detalles_pkey PRIMARY KEY (id_planilla_aportes_detalles),
	CONSTRAINT fk_planilla_aportes FOREIGN KEY (id_planilla_aportes) REFERENCES transversales.planillas_aportes(id_planilla_aportes) ON DELETE CASCADE
);

CREATE TABLE transversales.pagos_aportes_mensuales (
	id_planilla_aportes int4 NOT NULL,
	fecha_pago timestamp NOT NULL,
	monto_pagado numeric(10, 2) NOT NULL,
	metodo_pago varchar(100) NULL,
	comprobante_pago varchar(255) NULL,
	foto_comprobante varchar(255) NULL,
	usuario_creacion varchar(100) DEFAULT SESSION_USER NOT NULL,
	fecha_creacion timestamp DEFAULT now() NOT NULL,
	usuario_modificacion varchar(100) NULL,
	fecha_modificacion timestamp NULL,
	observaciones text NULL,
	estado int2 DEFAULT 1 NOT NULL,
	estado_envio int4 NULL,
	monto_demasia numeric(10, 2) NULL,
	id serial4 NOT NULL,
	CONSTRAINT pagos_aportes_mensuales_pkey PRIMARY KEY (id),
	CONSTRAINT fk_planilla_aportes FOREIGN KEY (id_planilla_aportes) REFERENCES transversales.planillas_aportes(id_planilla_aportes) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_pagos_aportes_id_planilla ON transversales.pagos_aportes_mensuales USING btree (id_planilla_aportes);

CREATE TABLE transversales.notificaciones (
	id_notificacion serial4 NOT NULL,
	id_usuario_receptor varchar(100) NOT NULL,
	tipo_notificacion varchar(50) NOT NULL,
	mensaje text NOT NULL,
	id_recurso int8 NOT NULL,
	tipo_recurso varchar(50) NOT NULL,
	leido bool DEFAULT false NOT NULL,
	fecha_creacion timestamp DEFAULT now() NOT NULL,
	usuario_creacion varchar(100) DEFAULT SESSION_USER NOT NULL,
	empresa varchar(255) NULL,
	nom_usuario varchar(255) NULL,
	CONSTRAINT notificaciones_pkey PRIMARY KEY (id_notificacion)
);

CREATE TABLE transversales.empresa (
	id_empresa serial4 NOT NULL,
	emp_cod int4 NOT NULL,
	emp_reg varchar(10) NOT NULL,
	cod_patronal varchar(15) NOT NULL,
	emp_nom varchar(255) NOT NULL,
	emp_legal varchar(255) NULL,
	emp_activ text NULL,
	emp_ntrab int4 NULL,
	emp_calle varchar(255) NULL,
	emp_num varchar(20) NULL,
	emp_telf varchar(50) NULL,
	emp_zona varchar(100) NULL,
	emp_localidad varchar(100) NULL,
	emp_fini_act timestamp NULL,
	emp_lug varchar(100) NULL,
	emp_fec timestamp NULL,
	emp_usu varchar(100) NULL,
	emp_estado varchar(5) NOT NULL,
	emp_fec_baja timestamp NULL,
	emp_obs text NULL,
	tipo varchar(5) NULL,
	emp_nom_corto varchar(50) NULL,
	emp_nit int8 NULL,
	emp_matricula varchar(50) NULL,
	fecha_registro timestamp NULL,
	fecha_modificacion timestamp NULL,
	usuario_registro varchar(100) NULL,
	usuario_modificacion varchar(100) NULL,
	emp_cod_entidad varchar(50) NULL,
	CONSTRAINT empresa_cod_patronal_key UNIQUE (cod_patronal),
	CONSTRAINT empresa_pkey PRIMARY KEY (id_empresa)
);



-- =====================================================
-- MÓDULO DE INCAPACIDADES - BASE DE DATOS v1.0
-- =====================================================

-- 1. TABLA DE TIPOS DE INCAPACIDAD (configuración centralizada)
CREATE TABLE transversales.tipos_incapacidad (
    id_tipo_incapacidad SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- 'ENFERMEDAD_COMUN', 'MATERNIDAD', etc.
    nombre VARCHAR(100) NOT NULL,       -- 'Enfermedad Común', 'Maternidad', etc.
    descripcion TEXT,
    porcentaje_reembolso NUMERIC(5,2) NOT NULL, -- 75.00 o 90.00
    dias_carencia INTEGER DEFAULT 0,    -- 3 para enfermedad común, 0 para resto
    cotizaciones_minimas INTEGER DEFAULT 2, -- 2 para enfermedad común, 4 para maternidad
    requiere_denuncia_accidente BOOLEAN DEFAULT FALSE, -- TRUE solo para riesgo profesional
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT NOW(),
    usuario_creacion VARCHAR(255) DEFAULT SESSION_USER
);

-- 2. TABLA PRINCIPAL DE INCAPACIDADES (equivalente a planillas_aportes)
CREATE TABLE transversales.incapacidades_reembolso (
    id_incapacidad_reembolso SERIAL PRIMARY KEY,
    cod_patronal VARCHAR(200) NOT NULL,
    fecha_planilla DATE NOT NULL, -- fecha principal como en aportes
    mes VARCHAR(255) NULL,        -- mes extracto de fecha_planilla ('ENERO', 'FEBRERO')
    gestion VARCHAR(255) NULL,    -- año extracto de fecha_planilla ('2024', '2025')
    
    -- Campos financieros totales
    total_reembolso NUMERIC(18,6) DEFAULT 0 NOT NULL,
    total_enfermedad_comun NUMERIC(18,6) DEFAULT 0,
    total_maternidad NUMERIC(18,6) DEFAULT 0,
    total_riesgo_profesional NUMERIC(18,6) DEFAULT 0,
    total_enfermedad_profesional NUMERIC(18,6) DEFAULT 0,
    total_trabajadores INTEGER DEFAULT 0,
    
    -- Estados del flujo (igual que aportes)
    estado SMALLINT DEFAULT 1 NOT NULL, -- 1=BORRADOR, 2=PRESENTADO, 3=APROBADO
    
    -- Campos de auditoría y control
    com_nro INTEGER DEFAULT nextval('transversales.seq_comprobante'),
    usuario_creacion VARCHAR(255) DEFAULT SESSION_USER NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT NOW() NOT NULL,
    usuario_modificacion VARCHAR(255) NULL,
    fecha_modificacion TIMESTAMP NULL,
    nombre_creacion VARCHAR(255) NULL,
    
    -- Fechas del proceso
    fecha_incapacidad DATE NULL, -- fecha de la planilla de incapacidades
    fecha_presentacion TIMESTAMP NULL,
    fecha_aprobacion TIMESTAMP NULL,
    usuario_aprobacion VARCHAR(255) NULL,
    
    -- Observaciones y notas
    observaciones TEXT NULL,
    
    -- Relación con empresa
    id_empresa INTEGER NULL,
    
    CONSTRAINT fk_incapacidades_empresa FOREIGN KEY (id_empresa) 
        REFERENCES transversales.empresa(id_empresa),
    CONSTRAINT uk_incapacidad_mes_gestion UNIQUE (cod_patronal, mes, gestion)
);

-- 3. TABLA DETALLE DE INCAPACIDADES (equivalente a planilla_aportes_detalles)
CREATE TABLE transversales.incapacidades_reembolso_detalles (
    id_incapacidad_detalle SERIAL PRIMARY KEY,
    id_incapacidad_reembolso INTEGER NOT NULL,
    
    -- Numeración secuencial
    nro INTEGER NULL,
    
    -- Datos del trabajador (copiados desde planillas de aportes)
    ci VARCHAR(20) NOT NULL,
    matricula VARCHAR(20) NULL,
    apellido_paterno VARCHAR(255) NOT NULL,
    apellido_materno VARCHAR(255) NOT NULL,
    nombres VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(500) NOT NULL, -- calculado: nombres + apellidos
    
    -- Datos adicionales del trabajador
    sexo VARCHAR(10) NULL,
    cargo VARCHAR(255) NULL,
    regional VARCHAR(255) NULL,
    
    -- TIPO DE INCAPACIDAD (referencia a tabla de tipos)
    id_tipo_incapacidad INTEGER NOT NULL,
    
    -- Fechas de baja médica (del certificado)
    fecha_baja_medica_inicio DATE NOT NULL,
    fecha_baja_medica_fin DATE NOT NULL,
    dias_incapacidad_inicial INTEGER NOT NULL, -- días totales de la baja
    
    -- Fechas de cotización (período a reembolsar en este mes)
    fecha_cotizacion_del DATE NOT NULL, -- desde qué fecha se calcula en este mes
    fecha_cotizacion_al DATE NOT NULL,  -- hasta qué fecha se calcula en este mes
    dias_mes INTEGER NOT NULL,          -- días calendarios en el período
    dias_cbes INTEGER NOT NULL,         -- días que reembolsa CBES (descontando carencia)
    
    -- CÁLCULOS FINANCIEROS
    salario_total NUMERIC(18,6) NOT NULL,     -- salario mensual del trabajador
    salario_dia NUMERIC(18,6) NOT NULL,       -- salario_total / 30
    subtotal_salario NUMERIC(18,6) NOT NULL,  -- salario_dia * dias_cbes
    porcentaje_reembolso NUMERIC(5,2) NOT NULL, -- copiado desde tipos_incapacidad
    monto_reembolso NUMERIC(18,6) NOT NULL,   -- subtotal_salario * porcentaje / 100
    
    -- Control de validaciones
    cotizaciones_previas INTEGER DEFAULT 0, -- número de cotizaciones previas verificadas
    cumple_requisitos BOOLEAN DEFAULT FALSE, -- si cumple requisitos mínimos
    
    -- Referencia a la planilla de aportes donde se pagó este salario
    id_planilla_detalle_origen INTEGER NULL,
    
    -- Campos de auditoría
    estado VARCHAR(50) DEFAULT 'ACTIVO',
    observaciones TEXT NULL,
    fecha_registro TIMESTAMP DEFAULT NOW() NOT NULL,
    usuario_registro VARCHAR(255) DEFAULT SESSION_USER NOT NULL,
    usuario_modificacion VARCHAR(100) NULL,
    fecha_modificacion TIMESTAMP NULL,
    
    CONSTRAINT fk_incapacidad_detalle_cabecera FOREIGN KEY (id_incapacidad_reembolso) 
        REFERENCES transversales.incapacidades_reembolso(id_incapacidad_reembolso) ON DELETE CASCADE,
    CONSTRAINT fk_incapacidad_detalle_tipo FOREIGN KEY (id_tipo_incapacidad) 
        REFERENCES transversales.tipos_incapacidad(id_tipo_incapacidad),
    CONSTRAINT fk_incapacidad_detalle_planilla_origen FOREIGN KEY (id_planilla_detalle_origen) 
        REFERENCES transversales.planilla_aportes_detalles(id_planilla_aportes_detalles),
        
    -- Validaciones de negocio
    CONSTRAINT ck_fechas_validas CHECK (fecha_baja_medica_inicio <= fecha_baja_medica_fin),
    CONSTRAINT ck_cotizacion_valida CHECK (fecha_cotizacion_del <= fecha_cotizacion_al),
    CONSTRAINT ck_dias_positivos CHECK (dias_incapacidad_inicial > 0 AND dias_mes > 0 AND dias_cbes >= 0),
    CONSTRAINT ck_salarios_positivos CHECK (salario_total > 0 AND salario_dia > 0 AND monto_reembolso >= 0)
);

-- 3. TABLA DE DOCUMENTOS RESPALDATORIOS
CREATE TABLE transversales.incapacidades_documentos (
    id_documento SERIAL PRIMARY KEY,
    id_incapacidad_detalle INTEGER NOT NULL,
    
    tipo_documento VARCHAR(50) NOT NULL,
    -- Valores: 'CERTIFICADO_MEDICO', 'DENUNCIA_ACCIDENTE', 'FORMULARIO_C31', 'PLANILLA_SALARIOS'
    
    nombre_archivo VARCHAR(500) NOT NULL,
    ruta_archivo VARCHAR(1000) NOT NULL,
    tamaño_archivo BIGINT NULL,
    tipo_mime VARCHAR(100) NULL,
    
    -- Auditoría
    fecha_subida TIMESTAMP DEFAULT NOW() NOT NULL,
    usuario_subida VARCHAR(255) DEFAULT SESSION_USER NOT NULL,
    
    CONSTRAINT fk_documento_detalle FOREIGN KEY (id_incapacidad_detalle) 
        REFERENCES transversales.incapacidades_reembolso_detalles(id_incapacidad_detalle) ON DELETE CASCADE,
    CONSTRAINT ck_tipo_documento CHECK (tipo_documento IN 
        ('CERTIFICADO_MEDICO', 'DENUNCIA_ACCIDENTE', 'FORMULARIO_C31', 'PLANILLA_SALARIOS'))
);

-- 5. ÍNDICES PARA OPTIMIZAR CONSULTAS
CREATE INDEX idx_tipos_incapacidad_codigo ON transversales.tipos_incapacidad(codigo);
CREATE INDEX idx_tipos_incapacidad_activo ON transversales.tipos_incapacidad(activo);

CREATE INDEX idx_incapacidades_cod_patronal ON transversales.incapacidades_reembolso(cod_patronal);
CREATE INDEX idx_incapacidades_fecha_planilla ON transversales.incapacidades_reembolso(fecha_planilla);
CREATE INDEX idx_incapacidades_mes_gestion ON transversales.incapacidades_reembolso(mes, gestion);
CREATE INDEX idx_incapacidades_estado ON transversales.incapacidades_reembolso(estado);
CREATE INDEX idx_incapacidades_empresa ON transversales.incapacidades_reembolso(id_empresa);

CREATE INDEX idx_detalle_incapacidad ON transversales.incapacidades_reembolso_detalles(id_incapacidad_reembolso);
CREATE INDEX idx_detalle_ci ON transversales.incapacidades_reembolso_detalles(ci);
CREATE INDEX idx_detalle_matricula ON transversales.incapacidades_reembolso_detalles(matricula);
CREATE INDEX idx_detalle_tipo ON transversales.incapacidades_reembolso_detalles(id_tipo_incapacidad);
CREATE INDEX idx_detalle_fechas ON transversales.incapacidades_reembolso_detalles(fecha_cotizacion_del, fecha_cotizacion_al);

CREATE INDEX idx_documentos_detalle ON transversales.incapacidades_documentos(id_incapacidad_detalle);
CREATE INDEX idx_documentos_tipo ON transversales.incapacidades_documentos(tipo_documento);

-- 6. COMENTARIOS DESCRIPTIVOS
COMMENT ON TABLE transversales.tipos_incapacidad IS 'Catálogo de tipos de incapacidad con sus reglas de negocio';
COMMENT ON TABLE transversales.incapacidades_reembolso IS 'Planillas de reembolso por incapacidades temporales - Cabecera';
COMMENT ON TABLE transversales.incapacidades_reembolso_detalles IS 'Detalle de trabajadores con incapacidades para reembolso';
COMMENT ON TABLE transversales.incapacidades_documentos IS 'Documentos respaldatorios de incapacidades';

COMMENT ON COLUMN transversales.incapacidades_reembolso.estado IS '1=BORRADOR (editable), 2=PRESENTADO (solo lectura), 3=APROBADO (procesado)';
COMMENT ON COLUMN transversales.incapacidades_reembolso_detalles.dias_cbes IS 'Días que reembolsa CBES después de aplicar carencia (enfermedad común: desde 4° día)';
COMMENT ON COLUMN transversales.incapacidades_reembolso_detalles.cotizaciones_previas IS 'Número de cotizaciones previas verificadas (min 2 enfermedad común, 4 maternidad)';

-- 7. DATOS INICIALES - TIPOS DE INCAPACIDAD
INSERT INTO transversales.tipos_incapacidad (codigo, nombre, descripcion, porcentaje_reembolso, dias_carencia, cotizaciones_minimas, requiere_denuncia_accidente) VALUES
('ENFERMEDAD_COMUN', 'Enfermedad Común', 'Incapacidad por enfermedad común del trabajador', 75.00, 3, 2, FALSE),
('MATERNIDAD', 'Maternidad', 'Incapacidad por maternidad - prenatal y postnatal', 90.00, 0, 4, FALSE),
('RIESGO_PROFESIONAL', 'Riesgo Profesional (Accidente de Trabajo)', 'Incapacidad por accidente de trabajo', 90.00, 0, 2, TRUE),
('ENFERMEDAD_PROFESIONAL', 'Enfermedad Profesional', 'Incapacidad por enfermedad relacionada al trabajo', 75.00, 0, 2, FALSE);




-- COMPROBACIONES --------------------------------------------------------------------------------------------------------

-- 1. Ver tipos de incapacidad creados
SELECT codigo, nombre, porcentaje_reembolso, dias_carencia, cotizaciones_minimas 
FROM transversales.tipos_incapacidad;

-- 2. Verificar estructura de las tablas
SELECT table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'transversales' 
  AND table_name IN ('incapacidades_reembolso', 'incapacidades_reembolso_detalles')
ORDER BY table_name, ordinal_position;

-- 3. Ver constraints creados
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_schema = 'transversales' 
  AND table_name LIKE 'incapacidades_%';
