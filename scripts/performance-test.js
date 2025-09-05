/**
 * 🚀 SCRIPT DE PRUEBA DE RENDIMIENTO PARA PLANILLAS
 * 
 * Este script simula la carga de planillas con diferentes tamaños
 * para verificar el rendimiento del sistema después de las optimizaciones.
 */

const fs = require('fs');
const path = require('path');

// Configuración de pruebas
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/planillas_aportes/subir',
  testSizes: [
    { name: 'Pequeña', records: 100 },
    { name: 'Mediana', records: 1000 },
    { name: 'Grande', records: 5000 },
    { name: 'Muy Grande', records: 15000 },
    // { name: 'Máxima', records: 25000 }, // Descomenta para prueba extrema
  ]
};

/**
 * Genera datos de prueba para una planilla
 */
function generateTestData(recordCount) {
  const data = [];
  const headers = [
    'Número documento de identidad',
    'Apellido Paterno',
    'Apellido Materno',
    'Nombres',
    'Sexo (M/F)',
    'Cargo',
    'Fecha de nacimiento',
    'Fecha de ingreso',
    'Fecha de retiro',
    'Días pagados',
    'Haber Básico',
    'Bono de antigüedad',
    'Monto horas extra',
    'Monto horas extra nocturnas',
    'Otros bonos y pagos',
    'regional'
  ];

  // Agregar headers
  data.push(headers);

  // Generar registros de prueba
  for (let i = 1; i <= recordCount; i++) {
    const ci = `${Math.floor(Math.random() * 10000000)}-LP`;
    const apellidoPaterno = `APELLIDO${i}`;
    const apellidoMaterno = `MATERNO${i}`;
    const nombres = `NOMBRE${i} SEGUNDO${i}`;
    const sexo = Math.random() > 0.5 ? 'M' : 'F';
    const cargo = `CARGO ${Math.floor(Math.random() * 10) + 1}`;
    const fechaNac = '01/01/1980';
    const fechaIngreso = '01/01/2020';
    const fechaRetiro = '';
    const diasPagados = 30;
    const haberBasico = Math.floor(Math.random() * 5000) + 2500;
    const bonoAntiguedad = Math.floor(Math.random() * 1000);
    const horasExtra = Math.floor(Math.random() * 500);
    const horasExtraNocturnas = Math.floor(Math.random() * 300);
    const otrosBonos = Math.floor(Math.random() * 200);
    const regional = 'LA PAZ';

    data.push([
      ci, apellidoPaterno, apellidoMaterno, nombres, sexo, cargo,
      fechaNac, fechaIngreso, fechaRetiro, diasPagados, haberBasico,
      bonoAntiguedad, horasExtra, horasExtraNocturnas, otrosBonos, regional
    ]);
  }

  return data;
}

/**
 * Convierte datos a formato CSV
 */
function dataToCSV(data) {
  return data.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
}

/**
 * Crea archivo CSV de prueba
 */
function createTestFile(recordCount, fileName) {
  const data = generateTestData(recordCount);
  const csvContent = dataToCSV(data);
  const filePath = path.join(__dirname, 'temp', fileName);
  
  // Crear directorio temp si no existe
  const tempDir = path.dirname(filePath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, csvContent);
  return filePath;
}

/**
 * Simula la subida de archivo (requiere axios o fetch)
 */
async function uploadFile(filePath, testName) {
  const FormData = require('form-data');
  const axios = require('axios');
  
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('cod_patronal', '12345678');
  form.append('gestion', '2024');
  form.append('mes', '01');
  form.append('tipo_planilla', 'Mensual');
  form.append('usuario_creacion', 'test_user');
  form.append('nombre_creacion', 'Usuario de Prueba');

  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      `${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`,
      form,
      {
        headers: {
          ...form.getHeaders(),
        },
        timeout: 300000, // 5 minutos timeout
      }
    );
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    return {
      success: true,
      duration,
      response: response.data,
      testName
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    return {
      success: false,
      duration,
      error: error.message,
      testName
    };
  }
}

/**
 * Limpia archivos temporales
 */
function cleanup() {
  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      fs.unlinkSync(path.join(tempDir, file));
    });
    fs.rmdirSync(tempDir);
  }
}

/**
 * Ejecuta las pruebas de rendimiento
 */
async function runPerformanceTests() {
  console.log('🚀 INICIANDO PRUEBAS DE RENDIMIENTO');
  console.log('=====================================');
  
  const results = [];
  
  for (const testConfig of TEST_CONFIG.testSizes) {
    console.log(`\n📊 Ejecutando prueba: ${testConfig.name} (${testConfig.records} registros)`);
    
    try {
      // Crear archivo de prueba
      const fileName = `test_${testConfig.records}_records.csv`;
      const filePath = createTestFile(testConfig.records, fileName);
      
      console.log(`📁 Archivo creado: ${fileName}`);
      console.log(`⏱️  Iniciando subida...`);
      
      // Ejecutar prueba
      const result = await uploadFile(filePath, testConfig.name);
      results.push({
        ...result,
        records: testConfig.records
      });
      
      if (result.success) {
        console.log(`✅ Éxito: ${result.duration}s`);
        if (result.response.estadisticas) {
          console.log(`   📈 Registros procesados: ${result.response.estadisticas.total_registros}`);
          console.log(`   👥 Trabajadores únicos: ${result.response.estadisticas.trabajadores_unicos}`);
          console.log(`   📦 Lotes procesados: ${result.response.estadisticas.lotes_procesados}`);
        }
      } else {
        console.log(`❌ Error: ${result.error} (${result.duration}s)`);
      }
      
      // Pausa entre pruebas
      if (testConfig !== TEST_CONFIG.testSizes[TEST_CONFIG.testSizes.length - 1]) {
        console.log('⏳ Esperando 5 segundos antes de la siguiente prueba...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
    } catch (error) {
      console.error(`❌ Error en prueba ${testConfig.name}:`, error.message);
      results.push({
        success: false,
        duration: 0,
        error: error.message,
        testName: testConfig.name,
        records: testConfig.records
      });
    }
  }
  
  // Mostrar resumen
  console.log('\n📋 RESUMEN DE RESULTADOS');
  console.log('========================');
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.testName}: ${result.duration}s (${result.records} registros)`);
  });
  
  // Estadísticas
  const successfulTests = results.filter(r => r.success);
  const failedTests = results.filter(r => !r.success);
  
  console.log(`\n📊 Estadísticas generales:`);
  console.log(`   ✅ Pruebas exitosas: ${successfulTests.length}`);
  console.log(`   ❌ Pruebas fallidas: ${failedTests.length}`);
  
  if (successfulTests.length > 0) {
    const avgTime = successfulTests.reduce((sum, r) => sum + r.duration, 0) / successfulTests.length;
    const maxTime = Math.max(...successfulTests.map(r => r.duration));
    const minTime = Math.min(...successfulTests.map(r => r.duration));
    
    console.log(`   ⏱️  Tiempo promedio: ${avgTime.toFixed(2)}s`);
    console.log(`   🚀 Tiempo mínimo: ${minTime.toFixed(2)}s`);
    console.log(`   🐌 Tiempo máximo: ${maxTime.toFixed(2)}s`);
  }
  
  // Guardar resultados en archivo
  const resultsFile = path.join(__dirname, `performance_results_${Date.now()}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Resultados guardados en: ${resultsFile}`);
  
  // Limpiar archivos temporales
  cleanup();
  
  console.log('\n🎯 PRUEBAS COMPLETADAS');
}

/**
 * Verifica dependencias
 */
function checkDependencies() {
  try {
    require('axios');
    require('form-data');
    return true;
  } catch (error) {
    console.error('❌ Dependencias faltantes. Ejecuta:');
    console.error('   npm install axios form-data');
    return false;
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  if (checkDependencies()) {
    runPerformanceTests().catch(error => {
      console.error('❌ Error en pruebas de rendimiento:', error);
      cleanup();
    });
  }
}

module.exports = {
  runPerformanceTests,
  generateTestData,
  createTestFile
};
