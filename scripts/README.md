# 🚀 Scripts de Verificación de Rendimiento

Este directorio contiene scripts para verificar y probar el rendimiento del sistema después de implementar las optimizaciones.

## 📋 Archivos

### 1. `verify-performance.sql`
Script SQL completo para verificar:
- ✅ Índices creados correctamente
- 📊 Estadísticas de tablas
- 🔗 Conexiones activas
- ⚡ Rendimiento de consultas
- 💾 Uso de espacio
- ⚙️ Configuraciones de BD
- 🔒 Locks y bloqueos
- 📈 Estadísticas de índices
- 🗂️ Fragmentación de tablas

### 2. `performance-test.js`
Script Node.js para pruebas de carga:
- 🧪 Simula diferentes tamaños de planillas
- ⏱️ Mide tiempos de respuesta
- 📊 Genera estadísticas detalladas
- 💾 Guarda resultados en JSON

### 3. `test-actualizacion.js`
Script específico para probar actualizaciones:
- 🔄 Prueba el método `actualizarDetallesPlanilla`
- 🏗️ Crea planilla de prueba automáticamente
- ✅ Verifica que los datos se actualicen correctamente
- 📈 Mide rendimiento de operaciones de actualización

## 🛠️ Cómo usar

### Verificación de Base de Datos

```bash
# Conectar a PostgreSQL y ejecutar
psql -h tu_host -U tu_usuario -d tu_base_de_datos -f scripts/verify-performance.sql
```

### Pruebas de Rendimiento

```bash
# Instalar dependencias
npm install axios form-data

# Ejecutar pruebas de creación de planillas
node scripts/performance-test.js

# Ejecutar pruebas específicas de actualización
node scripts/test-actualizacion.js
```

## 📊 Interpretación de Resultados

### SQL Script
- **Índices**: Verifica que todos los índices estén creados
- **Conexiones**: Debe mostrar conexiones activas sin exceder el límite
- **Consultas**: Los EXPLAIN PLAN deben mostrar uso de índices
- **Fragmentación**: Debe ser < 10% para buen rendimiento

### Pruebas de Carga
- **100 registros**: < 5 segundos ✅
- **1,000 registros**: < 15 segundos ✅
- **5,000 registros**: < 45 segundos ✅
- **15,000 registros**: < 2 minutos ✅
- **25,000 registros**: < 3 minutos ✅

## ⚠️ Notas Importantes

1. **Backup**: Siempre haz backup antes de ejecutar pruebas
2. **Horarios**: Ejecuta pruebas fuera de horarios pico
3. **Recursos**: Monitorea CPU y memoria durante las pruebas
4. **Limpieza**: Los scripts limpian archivos temporales automáticamente

## 🔧 Personalización

### Modificar Tamaños de Prueba
Edita `TEST_CONFIG.testSizes` en `performance-test.js`:

```javascript
testSizes: [
  { name: 'Personalizada', records: 2000 },
  // ... más configuraciones
]
```

### Cambiar Endpoint
Modifica `TEST_CONFIG.baseUrl` y `TEST_CONFIG.endpoint` según tu configuración.

## 📈 Resultados Esperados

Después de las optimizaciones implementadas:

- ⚡ **50-70% mejora** en tiempo de inserción
- 🔗 **Uso eficiente** del pool de conexiones
- 🛡️ **Consistencia** garantizada con transacciones
- 📊 **Consultas optimizadas** con índices
- 💾 **Menor uso de memoria** con procesamiento por lotes

## 🆘 Solución de Problemas

### Error de Conexión
```bash
# Verificar que el servidor esté corriendo
curl http://localhost:3000/health

# Verificar configuración de BD
npm run start:dev
```

### Timeouts
- Incrementa timeout en `performance-test.js`
- Verifica configuraciones de BD en `.env`
- Monitorea logs del servidor

### Memoria Insuficiente
- Reduce `testSizes` en las pruebas
- Verifica configuración de `work_mem` en PostgreSQL
- Monitorea uso de memoria del servidor

## 🎯 Próximos Pasos

1. ✅ Ejecutar verificación SQL
2. ✅ Correr pruebas de rendimiento
3. ✅ Analizar resultados
4. ✅ Ajustar configuraciones si es necesario
5. ✅ Documentar baseline de rendimiento
6. ✅ Programar monitoreo continuo
