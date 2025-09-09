#!/bin/bash

# scripts/build-upload-deploy-backend.sh
# Script TODO EN UNO: Compilar + Subir + Desplegar backend

# === CONFIGURACIÓN ===
DEFAULT_SERVER="adminflima@10.0.10.218"
DEFAULT_REMOTE_PATH="~/PROYECTOS/COTIZACIONES/PRODUCCION-BACKEND"
DEFAULT_LOCAL_PATH="C:\\Users\\CBES\\Documents\\SISTEMAS\\COTIZACIONES\\BACKEND-COTIZACIONES\\cotizaciones-backend-produccion"

SERVER=${1:-$DEFAULT_SERVER}
REMOTE_PATH=${2:-$DEFAULT_REMOTE_PATH}
LOCAL_PATH=${3:-$DEFAULT_LOCAL_PATH}

echo "🚀 PROCESO COMPLETO: COMPILAR + SUBIR + DESPLEGAR BACKEND"
echo "========================================================="
echo "📁 Directorio local: $LOCAL_PATH"
echo "🖥️ Servidor: $SERVER"
echo "📂 Ruta remota: $REMOTE_PATH"
echo ""

# === VERIFICACIÓN INICIAL ===
if [ ! -f "$LOCAL_PATH/package.json" ]; then
  echo "❌ ERROR: package.json no encontrado en $LOCAL_PATH"
  exit 1
fi

cd "$LOCAL_PATH" || exit 1

# === PASO 1: COMPILACIÓN ===
echo ""
echo "🔨 PASO 1: COMPILANDO BACKEND..."
echo "==============================="

# Limpiar build anterior
echo "🧹 Limpiando build anterior..."
[ -d "dist" ] && rm -rf dist/

# Instalar dependencias y compilar
echo "📦 Instalando dependencias..."
npm install || { echo "❌ ERROR en npm install"; exit 1; }

echo "⚙️ Compilando proyecto..."
npm run build || { echo "❌ ERROR en compilación"; exit 1; }

echo "✅ Compilación completada"

# === AUTENTICACIÓN (UNA SOLA VEZ) ===
echo ""
echo "🔐 AUTENTICACIÓN"
echo "==============="

if ! command -v sshpass &> /dev/null; then
    echo "❌ ERROR: sshpass no está instalado"
    exit 1
fi

echo -n "Ingrese contraseña para $SERVER: "
read -s PASSWORD
echo ""
export SSHPASS="$PASSWORD"

ssh_cmd() {
    sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER" "$1"
}

scp_cmd() {
    sshpass -e scp -o StrictHostKeyChecking=no -r "$1" "$SERVER:$2"
}

# Verificar conectividad
echo "🔌 Verificando conectividad..."
if ! ssh_cmd "echo 'OK'"; then
    echo "❌ ERROR: No se puede conectar al servidor"
    exit 1
fi
echo "✅ Conectividad verificada"

# === PASO 2: SUBIDA DE ARCHIVOS ===
echo ""
echo "📤 PASO 2: SUBIENDO ARCHIVOS..."
echo "==============================="

# Crear directorios
echo "📁 Creando estructura..."
ssh_cmd "mkdir -p $REMOTE_PATH/cotizaciones-backend-produccion"

# Subir archivos principales
FILES_TO_UPLOAD=("dist" "reports" "package.json" "package-lock.json" "Dockerfile")
echo "📦 Subiendo archivos del backend..."

for file in "${FILES_TO_UPLOAD[@]}"; do
    if [ -e "$file" ]; then
        echo "  📄 Subiendo $file..."
        scp_cmd "$file" "$REMOTE_PATH/cotizaciones-backend-produccion/" || { echo "❌ Error subiendo $file"; exit 1; }
    fi
done

# Subir docker-compose.yml
PARENT_DIR=$(dirname "$LOCAL_PATH")
if [ -f "$PARENT_DIR/docker-compose.yml" ]; then
    echo "🐳 Subiendo docker-compose.yml..."
    scp_cmd "$PARENT_DIR/docker-compose.yml" "$REMOTE_PATH/" || { echo "❌ Error subiendo docker-compose.yml"; exit 1; }
fi

echo "✅ Archivos subidos correctamente"

# === PASO 3: DESPLIEGUE ===
echo ""
echo "🚀 PASO 3: DESPLEGANDO EN SERVIDOR..."
echo "===================================="

# Detener servicios antiguos
echo "🛑 Deteniendo servicios anteriores..."
ssh_cmd "cd $REMOTE_PATH && docker compose down 2>/dev/null || true"

# Limpiar
echo "🧹 Limpiando contenedores antiguos..."
ssh_cmd "cd $REMOTE_PATH && docker compose down -v --remove-orphans 2>/dev/null || true"

# Crear red
echo "🌐 Verificando red Docker..."
ssh_cmd "docker network create red_produccion 2>/dev/null || true"

# Instalar dependencias en el servidor
echo "📦 Instalando dependencias en servidor..."
ssh_cmd "cd $REMOTE_PATH/cotizaciones-backend-produccion && npm install --production 2>/dev/null || true"

# Construir imagen
echo "🔨 Construyendo imagen Docker..."
if ! ssh_cmd "cd $REMOTE_PATH && docker compose build --no-cache cotizaciones-backend-produccion"; then
    echo "❌ ERROR: Falló la construcción de la imagen"
    ssh_cmd "cd $REMOTE_PATH && docker compose logs cotizaciones-backend-produccion"
    exit 1
fi

# Iniciar servicios
echo "🚀 Iniciando servicios..."
if ! ssh_cmd "cd $REMOTE_PATH && docker compose up -d cotizaciones-backend-produccion"; then
    echo "❌ ERROR: Falló el inicio del servicio"
    ssh_cmd "cd $REMOTE_PATH && docker compose logs cotizaciones-backend-produccion"
    exit 1
fi

# Esperar
echo "⏱️ Esperando inicialización..."
sleep 15

# === VERIFICACIÓN FINAL ===
echo ""
echo "📊 VERIFICACIÓN FINAL"
echo "===================="

echo "🔍 Estado de contenedores:"
ssh_cmd "cd $REMOTE_PATH && docker compose ps"

echo ""
echo "📋 Últimos logs:"
ssh_cmd "cd $REMOTE_PATH && docker compose logs --tail=10 cotizaciones-backend-produccion"

# Verificar que esté corriendo
CONTAINER_STATUS=$(ssh_cmd "cd $REMOTE_PATH && docker compose ps --services --filter 'status=running' | grep cotizaciones-backend-produccion || echo 'NOT_RUNNING'")

echo ""
if [ "$CONTAINER_STATUS" = "NOT_RUNNING" ]; then
    echo "⚠️ ADVERTENCIA: El contenedor no está corriendo"
    echo "🔍 Logs completos para debug:"
    ssh_cmd "cd $REMOTE_PATH && docker compose logs cotizaciones-backend-produccion"
else
    echo "✅ ¡DESPLIEGUE EXITOSO!"
    echo ""
    echo "🎉 BACKEND DESPLEGADO CORRECTAMENTE"
    echo "=================================="
    echo "🖥️ Servidor: $SERVER"
    echo "🐳 Contenedor: backend-produccion"
    echo "🌐 Puerto: 4001"
    echo "🔗 URL: http://10.0.10.218:4001"
    echo ""
    echo "💡 Comandos útiles:"
    echo "   ssh $SERVER"
    echo "   cd $REMOTE_PATH"
    echo "   docker compose logs -f cotizaciones-backend-produccion"
    echo "   docker compose ps"
    echo "   docker compose restart cotizaciones-backend-produccion"
fi

echo ""
echo "⏰ Proceso completado en: $(date)"