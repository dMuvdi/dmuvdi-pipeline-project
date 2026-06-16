#!/bin/bash

# Script para invalidar el caché de CloudFront
# Uso: ./invalidate-cache.sh [profile-name]

PROFILE=${1:-default}
STACK_NAME="StudentPipelineStack"

echo "🔄 Obteniendo Distribution ID de CloudFront..."

DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --profile $PROFILE \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

if [ -z "$DIST_ID" ]; then
  echo "❌ Error: No se pudo obtener el Distribution ID"
  exit 1
fi

echo "📋 Distribution ID: $DIST_ID"
echo "🚀 Creando invalidación de caché..."

aws cloudfront create-invalidation \
  --distribution-id $DIST_ID \
  --paths "/*" \
  --profile $PROFILE

if [ $? -eq 0 ]; then
  echo "✅ Invalidación creada exitosamente"
  echo "⏱️  Los cambios estarán visibles en 1-3 minutos"
else
  echo "❌ Error al crear la invalidación"
  exit 1
fi
