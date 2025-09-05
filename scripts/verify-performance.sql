-- 🔍 SCRIPT PARA VERIFICAR ÍNDICES Y RENDIMIENTO

-- ============================================================================
-- 1. VERIFICAR QUE LOS ÍNDICES SE CREARON CORRECTAMENTE
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'transversales' 
    AND (tablename = 'planillas_aportes' OR tablename = 'planilla_aportes_detalles')
ORDER BY tablename, indexname;

-- ============================================================================
-- 2. VERIFICAR ESTADÍSTICAS DE LAS TABLAS
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserciones,
    n_tup_upd as actualizaciones,
    n_tup_del as eliminaciones,
    n_live_tup as registros_activos,
    n_dead_tup as registros_muertos
FROM pg_stat_user_tables 
WHERE schemaname = 'transversales' 
    AND (tablename = 'planillas_aportes' OR tablename = 'planilla_aportes_detalles')
ORDER BY tablename;

-- ============================================================================
-- 3. VERIFICAR CONEXIONES ACTIVAS Y POOL DE CONEXIONES
-- ============================================================================
SELECT 
    count(*) as conexiones_activas,
    state,
    application_name
FROM pg_stat_activity 
WHERE datname = current_database()
    AND state IS NOT NULL
GROUP BY state, application_name
ORDER BY conexiones_activas DESC;

-- ============================================================================
-- 4. VERIFICAR RENDIMIENTO DE CONSULTAS FRECUENTES
-- ============================================================================

-- 4.1 Consulta por código patronal (debe usar índice IDX_planilla_cod_patronal)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM transversales.planillas_aportes 
WHERE cod_patronal = '12345678' 
LIMIT 10;

-- 4.2 Consulta por fecha y tipo (debe usar índice IDX_planilla_fecha_tipo)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM transversales.planillas_aportes 
WHERE cod_patronal = '12345678' 
    AND fecha_planilla = '2024-01-01' 
    AND tipo_planilla = 'Mensual'
LIMIT 10;

-- 4.3 Consulta de detalles por planilla (debe usar índice IDX_detalle_planilla_id)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM transversales.planilla_aportes_detalles 
WHERE id_planilla_aportes = 1
LIMIT 100;

-- ============================================================================
-- 5. VERIFICAR TAMAÑOS DE TABLAS Y USO DE ESPACIO
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as tamaño_total,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as tamaño_tabla,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as tamaño_indices
FROM pg_tables 
WHERE schemaname = 'transversales' 
    AND (tablename = 'planillas_aportes' OR tablename = 'planilla_aportes_detalles')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- 6. VERIFICAR CONFIGURACIONES DE BASE DE DATOS
-- ============================================================================
SELECT 
    name,
    setting,
    unit,
    context
FROM pg_settings 
WHERE name IN (
    'max_connections',
    'shared_buffers',
    'work_mem',
    'maintenance_work_mem',
    'effective_cache_size',
    'random_page_cost',
    'seq_page_cost',
    'default_statistics_target'
)
ORDER BY name;

-- ============================================================================
-- 7. VERIFICAR LOCKS Y BLOQUEOS
-- ============================================================================
SELECT 
    pid,
    usename,
    application_name,
    state,
    query_start,
    state_change,
    wait_event_type,
    wait_event,
    LEFT(query, 100) as query_preview
FROM pg_stat_activity 
WHERE datname = current_database()
    AND state != 'idle'
    AND pid != pg_backend_pid()
ORDER BY query_start;

-- ============================================================================
-- 8. ESTADÍSTICAS DE RENDIMIENTO DE ÍNDICES
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'NUNCA USADO'
        WHEN idx_scan < 10 THEN 'POCO USADO'
        WHEN idx_scan < 100 THEN 'USO MODERADO'
        ELSE 'MUY USADO'
    END as uso_indice
FROM pg_stat_user_indexes
WHERE schemaname = 'transversales' 
    AND (tablename = 'planillas_aportes' OR tablename = 'planilla_aportes_detalles')
ORDER BY idx_scan DESC;

-- ============================================================================
-- 9. VERIFICAR FRAGMENTACIÓN DE TABLAS
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    n_live_tup as registros_vivos,
    n_dead_tup as registros_muertos,
    CASE 
        WHEN n_live_tup = 0 THEN 0
        ELSE ROUND((n_dead_tup::float / n_live_tup::float) * 100, 2)
    END as porcentaje_fragmentacion
FROM pg_stat_user_tables 
WHERE schemaname = 'transversales' 
    AND (tablename = 'planillas_aportes' OR tablename = 'planilla_aportes_detalles')
ORDER BY porcentaje_fragmentacion DESC;

-- ============================================================================
-- 10. RESUMEN FINAL
-- ============================================================================
SELECT 
    '🎯 VERIFICACIÓN COMPLETADA' as mensaje,
    current_timestamp as fecha_verificacion,
    current_database() as base_datos,
    version() as version_postgresql;
