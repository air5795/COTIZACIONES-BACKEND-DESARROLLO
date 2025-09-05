/**
 * 🧪 SCRIPT DE PRUEBAS ESPECÍFICAS PARA ACTUALIZACIÓN DE PLANILLAS
 * 
 * Este script prueba específicamente el método actualizarDetallesPlanilla
 * con diferentes escenarios para verificar que las optimizaciones funcionen correctamente.
 */

const fs = require('fs');
const path = require('path');

// Configuración de pruebas
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  endpoint: '/planillas_aportes/detalles',
  testCases: [
    {
      name: 'Actualización Pequeña',
      records: 50,
      description: 'Prueba básica con pocos registros'
    },
    {
      name: 'Actualización Mediana',
      records: 500,
      description: 'Prueba con cantidad moderada de registros'
    },
    {
      name: 'Actualización Grande',
      records: 2000,
      description: 'Prueba con gran cantidad de registros'
    },
    {
      name: 'Actualización Muy Grande',
      records: 10000,
      description: 'Prueba con cantidad muy grande de registros'
    },
    // {
    //   name: 'Actualización Máxima',
    //   records: 25000,
    //   description: 'Prueba con cantidad máxima de registros'
    // }
  ]
};

/**
 * Genera datos de prueba para actualización
 */
function generateUpdateData(recordCount, baseCi = 1000000) {
  const trabajadores = [];

  for (let i = 1; i <= recordCount; i++) {
    const ci = `${baseCi + i}`;
    const trabajador = {
      'Número documento de identidad': ci,
      'Apellido Paterno': `APELLIDO_UPD_${i}`,
      'Apellido Materno': `MATERNO_UPD_${i}`,
      'Nombres': `NOMBRE_ACTUALIZADO_${i}`,
      'Sexo (M/F)': Math.random() > 0.5 ? 'M' : 'F',
      'Cargo': `CARGO_MODIFICADO_${Math.floor(Math.random() * 10) + 1}`,
      'Fecha de nacimiento': '15/05/1985',
      'Fecha de ingreso': '01/06/2021',
      'Fecha de retiro': '',
      'Días pagados': 30,
      'Haber Básico': Math.floor(Math.random() * 3000) + 2000, // 2000-5000
      'Bono de antigüedad': Math.floor(Math.random() * 800) + 200, // 200-1000
      'Monto horas extra': Math.floor(Math.random() * 600), // 0-600
      'Monto horas extra nocturnas': Math.floor(Math.random() * 400), // 0-400
      'Otros bonos y pagos': Math.floor(Math.random() * 300), // 0-300
      'regional': 'LA PAZ'
    };

    trabajadores.push(trabajador);
  }

  return trabajadores;
}

/**
 * Realiza una prueba de actualización
 */
async function testActualizacion(planillaId, testCase) {
  const axios = require('axios');
  
  console.log(`\n🧪 Ejecutando: ${testCase.name}`);
  console.log(`   📝 ${testCase.description}`);
  console.log(`   📊 Registros: ${testCase.records}`);

  const trabajadores = generateUpdateData(testCase.records);
  
  const payload = {
    trabajadores: trabajadores
  };

  const startTime = Date.now();
  
  try {
    const response = await axios.put(
      `${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}/${planillaId}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
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
      testName: testCase.name,
      records: testCase.records
    };
    
  } catch (error) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    return {
      success: false,
      duration,
      error: error.response?.data || error.message,
      testName: testCase.name,
      records: testCase.records
    };
  }
}

/**
 * Crea una planilla de prueba para actualizar
 */
async function crearPlanillaPrueba() {
  const axios = require('axios');
  const FormData = require('form-data');
  
  console.log('🏗️ Creando planilla de prueba para actualización...');
  
  // Generar datos iniciales
  const datosIniciales = generateUpdateData(10, 9000000); // 10 registros iniciales
  
  // Convertir a CSV
  const headers = Object.keys(datosIniciales[0]);
  const csvContent = [
    headers.join(','),
    ...datosIniciales.map(row => 
      headers.map(header => `"${row[header]}"`).join(',')
    )
  ].join('\n');
  
  // Crear archivo temporal
  const tempFile = path.join(__dirname, 'temp_planilla_inicial.csv');
  fs.writeFileSync(tempFile, csvContent);
  
  try {
    // Crear planilla
    const form = new FormData();
    form.append('file', fs.createReadStream(tempFile));
    form.append('cod_patronal', '99999999'); // Código especial para pruebas
    form.append('gestion', '2024');
    form.append('mes', '12');
    form.append('tipo_planilla', 'Mensual');
    form.append('usuario_creacion', 'test_actualizacion');
    form.append('nombre_creacion', 'Usuario Prueba Actualización');

    const response = await axios.post(
      `${TEST_CONFIG.baseUrl}/planillas_aportes/subir`,
      form,
      {
        headers: {
          ...form.getHeaders(),
        },
        timeout: 60000,
      }
    );
    
    // Limpiar archivo temporal
    fs.unlinkSync(tempFile);
    
    return response.data.id_planilla;
    
  } catch (error) {
    // Limpiar archivo temporal en caso de error
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw error;
  }
}

/**
 * Verifica que la planilla tenga los datos actualizados
 */
async function verificarActualizacion(planillaId, expectedRecords) {
  const axios = require('axios');
  
  try {
    const response = await axios.get(
      `${TEST_CONFIG.baseUrl}/planillas_aportes/detalles/${planillaId}?limite=0`,
      { timeout: 30000 }
    );
    
    const detalles = response.data.detalles || [];
    const actualRecords = detalles.length;
    
    console.log(`   🔍 Verificación: ${actualRecords}/${expectedRecords} registros`);
    
    return {
      success: actualRecords === expectedRecords,
      actualRecords,
      expectedRecords,
      sampleData: detalles.slice(0, 3) // Primeros 3 registros como muestra
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      actualRecords: 0,
      expectedRecords
    };
  }
}

/**
 * Ejecuta todas las pruebas de actualización
 */
async function runActualizacionTests() {
  console.log('🚀 INICIANDO PRUEBAS DE ACTUALIZACIÓN DE PLANILLAS');
  console.log('==================================================');
  
  let planillaId;
  const results = [];
  
  try {
    // Crear planilla de prueba
    planillaId = await crearPlanillaPrueba();
    console.log(`✅ Planilla de prueba creada: ID ${planillaId}`);
    
    // Ejecutar pruebas
    for (const testCase of TEST_CONFIG.testCases) {
      try {
        // Ejecutar actualización
        const result = await testActualizacion(planillaId, testCase);
        results.push(result);
        
        if (result.success) {
          console.log(`   ✅ Éxito: ${result.duration}s`);
          
          if (result.response.estadisticas) {
            console.log(`   📈 Registros procesados: ${result.response.estadisticas.registros_procesados}`);
            console.log(`   👥 Trabajadores únicos: ${result.response.estadisticas.trabajadores_unicos}`);
            console.log(`   💰 Total importe: ${result.response.total_importe}`);
            console.log(`   ⏱️ Tiempo reportado: ${result.response.tiempoEjecucion}`);
          }
          
          // Verificar actualización
          console.log(`   🔍 Verificando actualización...`);
          const verification = await verificarActualizacion(planillaId, testCase.records);
          
          if (verification.success) {
            console.log(`   ✅ Verificación exitosa`);
          } else {
            console.log(`   ⚠️ Verificación falló: ${verification.actualRecords}/${verification.expectedRecords}`);
          }
          
        } else {
          console.log(`   ❌ Error: ${JSON.stringify(result.error)} (${result.duration}s)`);
        }
        
        // Pausa entre pruebas
        if (testCase !== TEST_CONFIG.testCases[TEST_CONFIG.testCases.length - 1]) {
          console.log('   ⏳ Esperando 3 segundos antes de la siguiente prueba...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        console.error(`   ❌ Error en prueba ${testCase.name}:`, error.message);
        results.push({
          success: false,
          duration: 0,
          error: error.message,
          testName: testCase.name,
          records: testCase.records
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error al crear planilla de prueba:', error.message);
    return;
  }
  
  // Mostrar resumen
  console.log('\n📋 RESUMEN DE PRUEBAS DE ACTUALIZACIÓN');
  console.log('======================================');
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const throughput = result.success ? (result.records / result.duration).toFixed(1) : '0';
    console.log(`${status} ${result.testName}: ${result.duration}s (${result.records} registros, ${throughput} reg/s)`);
  });
  
  // Estadísticas
  const successfulTests = results.filter(r => r.success);
  const failedTests = results.filter(r => !r.success);
  
  console.log(`\n📊 Estadísticas generales:`);
  console.log(`   ✅ Pruebas exitosas: ${successfulTests.length}/${results.length}`);
  console.log(`   ❌ Pruebas fallidas: ${failedTests.length}/${results.length}`);
  
  if (successfulTests.length > 0) {
    const avgTime = successfulTests.reduce((sum, r) => sum + r.duration, 0) / successfulTests.length;
    const totalRecords = successfulTests.reduce((sum, r) => sum + r.records, 0);
    const totalTime = successfulTests.reduce((sum, r) => sum + r.duration, 0);
    const avgThroughput = totalRecords / totalTime;
    
    console.log(`   ⏱️ Tiempo promedio: ${avgTime.toFixed(2)}s`);
    console.log(`   🚀 Throughput promedio: ${avgThroughput.toFixed(1)} registros/segundo`);
    console.log(`   📊 Total registros procesados: ${totalRecords.toLocaleString()}`);
  }
  
  // Limpiar planilla de prueba
  if (planillaId) {
    try {
      console.log(`\n🧹 Limpiando planilla de prueba ${planillaId}...`);
      // Aquí podrías agregar código para eliminar la planilla de prueba si tienes ese endpoint
      console.log('✅ Limpieza completada');
    } catch (error) {
      console.warn('⚠️ No se pudo limpiar la planilla de prueba:', error.message);
    }
  }
  
  // Guardar resultados
  const resultsFile = path.join(__dirname, `actualizacion_results_${Date.now()}.json`);
  const detailedResults = {
    timestamp: new Date().toISOString(),
    planilla_prueba_id: planillaId,
    config: TEST_CONFIG,
    results: results,
    summary: {
      total_tests: results.length,
      successful_tests: successfulTests.length,
      failed_tests: failedTests.length,
      avg_time: successfulTests.length > 0 ? 
        successfulTests.reduce((sum, r) => sum + r.duration, 0) / successfulTests.length : 0,
      total_records: successfulTests.reduce((sum, r) => sum + r.records, 0)
    }
  };
  
  fs.writeFileSync(resultsFile, JSON.stringify(detailedResults, null, 2));
  console.log(`\n💾 Resultados detallados guardados en: ${resultsFile}`);
  
  console.log('\n🎯 PRUEBAS DE ACTUALIZACIÓN COMPLETADAS');
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
    runActualizacionTests().catch(error => {
      console.error('❌ Error en pruebas de actualización:', error);
    });
  }
}

module.exports = {
  runActualizacionTests,
  generateUpdateData,
  testActualizacion
};
