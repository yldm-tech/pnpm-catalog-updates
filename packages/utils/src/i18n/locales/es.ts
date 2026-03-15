/**
 * Spanish Translations (Español)
 */

import type { TranslationDictionary } from '../types.js'

export const es: TranslationDictionary = {
  // Error messages
  'error.packageNotFound': 'El paquete "{{packageName}}" no existe en el registro npm',
  'error.packageNotFoundWithSuggestion': 'El paquete "{{packageName}}" no existe',
  'error.possiblePackageNames': 'Posibles nombres de paquetes correctos:',
  'error.checkPackageName':
    'Por favor verifique si el nombre del paquete es correcto, o el paquete puede haber sido eliminado',
  'error.emptyVersion': 'La información de versión del paquete "{{packageName}}" está vacía',
  'error.emptyVersionReasons':
    'Esto puede deberse a:\n   • Problemas con la configuración del package.json\n   • Formato de versión incorrecto en la configuración del catálogo\n   • Problemas de sincronización de datos del registro npm',
  'error.networkError': 'Error de red al verificar el paquete "{{packageName}}"',
  'error.networkRetry': 'Por favor intente de nuevo más tarde o verifique su conexión de red',
  'error.registryError': 'Error del registro para "{{packageName}}": {{message}}',
  'error.workspaceNotFound': 'No se encontró workspace pnpm en "{{path}}"',
  'error.catalogNotFound': 'Catálogo "{{catalogName}}" no encontrado',
  'error.invalidVersion': 'Versión inválida "{{version}}"',
  'error.invalidVersionRange': 'Rango de versión inválido "{{range}}"',
  'error.configurationError': 'Error de configuración: {{message}}',
  'error.fileSystemError': 'Error del sistema de archivos: {{message}}',
  'error.cacheError': 'Error de caché: {{message}}',
  'error.securityCheckFailed':
    'Verificación de seguridad fallida para "{{packageName}}": {{message}}',
  'error.securityCheckUnavailable':
    'No se puede verificar el estado de seguridad de "{{packageName}}"',
  'error.updateFailed': 'Actualización fallida: {{message}}',
  'error.packageSkipped': 'Omitiendo paquete "{{packageName}}" (verificación fallida)',
  'error.unknown': 'Ocurrió un error desconocido',

  // Validation errors
  'validation.packageNameRequired': 'El nombre del paquete es requerido',
  'validation.invalidFormat':
    'Formato inválido. Debe ser uno de: table, json, yaml, minimal, github, gitlab, junit, sarif',
  'validation.invalidSeverity':
    'Severidad inválida. Debe ser uno de: low, moderate, high, critical',
  'validation.invalidTarget':
    'Objetivo inválido. Debe ser uno de: latest, greatest, minor, patch, newest',
  'validation.interactiveWithDryRun': 'No se puede usar --interactive con --dry-run',
  'validation.includePatternsEmpty': 'Los patrones de inclusión no pueden estar vacíos',
  'validation.excludePatternsEmpty': 'Los patrones de exclusión no pueden estar vacíos',
  'validation.workspaceDirNotExist': 'El directorio del workspace no existe: {{path}}',
  'validation.invalidProvider': 'Proveedor inválido. Debe ser uno de: auto, claude, gemini, codex',
  'validation.invalidAnalysisType':
    'Tipo de análisis inválido. Debe ser uno de: impact, security, compatibility, recommend',
  'validation.invalidGraphType': 'Tipo de gráfico inválido. Debe ser uno de: {{validTypes}}',
  'validation.invalidGraphFormat': 'Formato de gráfico inválido. Debe ser uno de: {{validFormats}}',

  // Success messages
  'success.updateComplete': 'Actualización completada exitosamente',
  'success.cacheCleared': 'Caché limpiada exitosamente',
  'success.configInitialized': 'Configuración inicializada exitosamente',
  'success.validationPassed': 'Todas las validaciones pasaron',

  // Info messages
  'info.checkingUpdates': 'Verificando dependencias de catálogo desactualizadas',
  'info.foundOutdated': 'Se encontraron {{count}} dependencias desactualizadas',
  'info.noUpdatesFound': '¡Todas las dependencias del catálogo están actualizadas!',
  'info.runWithUpdate': 'Ejecute con --update para aplicar actualizaciones',
  'info.majorWarning': 'Las actualizaciones mayores pueden contener cambios incompatibles',
  'info.securityUpdates': '{{count}} actualizaciones de seguridad disponibles',

  // Warning messages
  'warning.configExists': 'El archivo de configuración ya existe',
  'warning.workspaceNotDetected': 'No se detectó estructura de workspace PNPM',
  'warning.deprecatedPackage': 'El paquete "{{packageName}}" está obsoleto',

  // Summary messages
  'summary.skippedPackages': 'Se omitieron {{count}} verificaciones de paquetes:',
  'summary.notFoundPackages': 'No encontrados ({{count}}): {{packages}}',
  'summary.emptyVersionPackages': 'Información de versión vacía ({{count}}): {{packages}}',
  'summary.networkIssuePackages': 'Problemas de red ({{count}}): {{packages}}',
  'summary.otherIssuePackages': 'Otros problemas ({{count}}): {{packages}}',
  'summary.securityCheckFailures': 'Fallos de verificación de seguridad: {{count}}',

  // Command messages
  'command.workspace.title': 'Workspace',
  'command.workspace.path': 'Ruta',
  'command.workspace.packages': 'Paquetes',
  'command.workspace.catalogs': 'Catálogos',
  'command.workspace.catalogNames': 'Nombres de catálogos',
  'command.check.analyzing': 'Analizando dependencias del catálogo...',
  'command.check.summary': 'Resumen',
  'command.check.majorUpdates': '{{count}} actualizaciones mayores',
  'command.check.minorUpdates': '{{count}} actualizaciones menores',
  'command.check.patchUpdates': '{{count}} actualizaciones de parche',
  'command.init.creating': 'Creando configuración PCU...',
  'command.init.success': '¡Configuración PCU inicializada exitosamente!',
  'command.init.nextSteps': 'Próximos pasos',

  // Theme command
  'command.theme.availableThemes': 'Temas disponibles:',
  'command.theme.invalidTheme': 'Tema inválido: {{theme}}',
  'command.theme.setTo': 'Tema establecido: {{theme}}',
  'command.theme.configured': 'Tema configurado: {{theme}}',
  'command.theme.cancelled': 'Selección de tema cancelada.',
  'command.theme.currentSettings': 'Configuración actual del tema:',
  'command.theme.preview': 'Vista previa del tema:',
  'command.theme.useHint':
    'Use --set <tema> para cambiar el tema o --interactive para configuración guiada',

  // Analyze command
  'command.analyze.autoDetecting': 'Detectando automáticamente catálogo para {{packageName}}...',
  'command.analyze.notFoundInCatalog': 'Paquete "{{packageName}}" no encontrado en ningún catálogo',
  'command.analyze.specifyManually':
    'Use --catalog <nombre> para especificar el catálogo manualmente',
  'command.analyze.foundInCatalog': 'Encontrado en catálogo: {{catalog}}',
  'command.analyze.runningAI': 'Ejecutando análisis impulsado por IA...',
  'command.analyze.aiFailed': 'Análisis de IA fallido, mostrando análisis básico:',

  // Update command
  'command.update.planningUpdates': 'Planificando actualizaciones...',
  'command.update.loadingConfig': 'Cargando configuración del workspace...',
  'command.update.checkingVersions': 'Verificando versiones de paquetes...',
  'command.update.analyzingUpdates': 'Analizando actualizaciones...',
  'command.update.allUpToDate': '¡Todas las dependencias están actualizadas!',
  'command.update.foundUpdates': 'Se encontraron {{count}} actualización(es) disponibles',
  'command.update.noUpdatesSelected': 'No se seleccionaron actualizaciones',
  'command.update.runningBatchAI': 'Ejecutando análisis por lotes de IA para {{count}} paquetes...',
  'command.update.batchAIHint':
    'Esto analiza todos los paquetes en una sola solicitud para mayor eficiencia.',
  'command.update.processingChunks': 'Procesando lote {{current}}/{{total}}...',
  'command.update.aiResults': 'Resultados del análisis de IA:',
  'command.update.provider': 'Proveedor: {{provider}}',
  'command.update.confidence': 'Confianza: {{confidence}}%',
  'command.update.processingTime': 'Tiempo de procesamiento: {{time}}ms',
  'command.update.summary': 'Resumen:',
  'command.update.packageRecommendations': 'Recomendaciones de paquetes:',
  'command.update.breakingChanges': 'Cambios incompatibles: {{changes}}',
  'command.update.securityFixes': 'Correcciones de seguridad: {{fixes}}',
  'command.update.warnings': 'Advertencias:',
  'command.update.aiSkipRecommend':
    'La IA recomienda omitir {{count}} paquete(s) debido a riesgos.',
  'command.update.useForce': 'Use --force para anular las recomendaciones de IA.',
  'command.update.preparingApply': 'Preparando para aplicar actualizaciones...',
  'command.update.applyingUpdates': 'Aplicando actualizaciones...',
  'command.update.appliedUpdates': 'Se aplicaron {{count}} actualizaciones',
  'command.update.generatingPreview': 'Generando vista previa...',
  'command.update.previewComplete': 'Vista previa de actualización completa',
  'command.update.dryRunHint': 'Ejecución en seco - sin cambios realizados',
  'command.update.planSaved': 'Plan de actualización guardado en {path}',
  'command.update.processComplete': '¡Proceso de actualización completado!',
  'command.update.aiBatchFailed':
    'Análisis por lotes de IA fallido, continuando sin información de IA:',
  'command.update.runningPnpmInstall':
    'Ejecutando pnpm install para actualizar el archivo de bloqueo...',
  'command.update.pnpmInstallSuccess': 'pnpm install completado exitosamente',
  'command.update.pnpmInstallFailed':
    'pnpm install falló (las actualizaciones del catálogo fueron exitosas)',
  'command.update.fetchingChangelogs': 'Obteniendo registros de cambios...',
  'command.update.changelogUnavailable': 'Registro de cambios no disponible',
  'command.update.cancelled': 'Operación cancelada',
  'command.update.moreLines': '{{count}} líneas más, use --verbose',
  'command.update.installError': 'Error inesperado durante la instalación',
  'command.update.suggestFix': 'Sugerencias:',
  'command.update.suggestManualInstall': 'Intente ejecutar "{{pm}} install" manualmente',
  'command.update.suggestCheckDeps':
    'Verifique los conflictos de dependencias en su espacio de trabajo',
  'command.update.suggestInstallPm': 'Asegúrese de que {{pm}} esté instalado y en su PATH',
  'command.update.suggestRetry': 'Intente ejecutar el comando nuevamente',
  'command.update.suggestCheckNetwork': 'Verifique su conexión de red',

  // Rollback command
  'command.rollback.noBackups': 'No se encontraron copias de seguridad',
  'command.rollback.createBackupHint':
    'Use "pcu update -b" para crear una copia de seguridad antes de actualizar',
  'command.rollback.availableBackups': 'Copias de seguridad disponibles ({{count}})',
  'command.rollback.restoreHint': 'Use "pcu rollback" para restaurar desde una copia de seguridad',
  'command.rollback.restoringLatest': 'Restaurando desde la última copia de seguridad',
  'command.rollback.from': 'Desde',
  'command.rollback.confirmRestore': '¿Está seguro de que desea restaurar esta copia de seguridad?',
  'command.rollback.cancelled': 'Reversión cancelada',
  'command.rollback.success': '¡Reversión completada exitosamente!',
  'command.rollback.runPnpmInstall':
    'Ejecute "pnpm install" para sincronizar el archivo de bloqueo',
  'command.rollback.selectBackup': 'Seleccione una copia de seguridad para restaurar',
  'command.rollback.chooseBackup': 'Elegir copia de seguridad',
  'command.rollback.warning': 'Advertencia: Esto sobrescribirá su pnpm-workspace.yaml actual',
  'command.rollback.willRestore': 'Se restaurará desde: {{time}}',
  'command.rollback.autoBackupNote':
    'Su estado actual se respaldará automáticamente antes de restaurar',
  'command.rollback.preRestoreBackupCreated': 'Respaldo pre-restauración guardado en: {{path}}',
  'command.rollback.safetyNote': 'Para deshacer este rollback, ejecute "pcu rollback" de nuevo',
  'command.rollback.deleteWarning': 'Advertencia: Se eliminarán {{count}} copia(s) de seguridad',
  'command.rollback.confirmDelete':
    '¿Está seguro de que desea eliminar todas las copias de seguridad?',
  'command.rollback.deletedBackups': 'Se eliminaron {{count}} copia(s) de seguridad',
  // Rollback verification
  'command.rollback.verification.validYaml': 'Estructura YAML válida',
  'command.rollback.verification.catalogsFound': 'Se encontraron {{count}} catálogo(s)',
  'command.rollback.verification.catalogs': 'Catálogos',
  'command.rollback.verification.dependencies': 'Total de dependencias: {{count}}',
  'command.rollback.verification.warning': 'Reversión completada con advertencias',
  'command.rollback.verification.invalidYaml': 'Estructura YAML inválida',
  'command.rollback.verification.noCatalogs': 'No se encontró estructura de catálogo',
  'command.rollback.verification.skipped': 'Verification skipped',

  // Watch command
  'command.watch.starting': 'Iniciando modo de vigilancia...',
  'command.watch.watching': 'Vigilando',
  'command.watch.pressCtrlC': 'Presione Ctrl+C para detener',
  'command.watch.stopping': 'Deteniendo modo de vigilancia...',
  'command.watch.stopped': 'Modo de vigilancia detenido',
  'command.watch.checkingUpdates': 'Verificando actualizaciones...',
  'command.watch.foundOutdated': 'Se encontraron {{count}} paquete(s) desactualizado(s)',
  'command.watch.waitingForChanges': 'Esperando cambios...',
  'command.watch.runUpdateHint': 'Ejecute "pcu update" para aplicar actualizaciones',

  // Self-update command
  'command.selfUpdate.checking': 'Verificando actualizaciones de pcu...',
  'command.selfUpdate.updating': 'Actualizando pcu a la versión {{version}}...',
  'command.selfUpdate.success': '¡Actualizado correctamente a la versión {{version}}!',
  'command.selfUpdate.failed': 'Error al actualizar pcu',
  'command.selfUpdate.latestAlready': 'Ya está utilizando la última versión ({{version}})',
  'command.selfUpdate.restartHint': 'Reinicie su terminal para usar la nueva versión.',
  'command.selfUpdate.manualHint': 'Puede actualizar manualmente con: npm install -g pcu@latest',

  // AI command
  'command.ai.cacheCleared': 'Caché de análisis de IA limpiada',
  'command.ai.cacheStats': 'Estadísticas de caché de análisis de IA',
  'command.ai.totalEntries': 'Entradas totales',
  'command.ai.cacheHits': 'Aciertos de caché',
  'command.ai.cacheMisses': 'Fallos de caché',
  'command.ai.hitRate': 'Tasa de aciertos',
  'command.ai.testingAnalysis': 'Probando análisis de IA...',
  'command.ai.testSuccess': '¡Prueba de análisis de IA exitosa!',
  'command.ai.testFailed': 'Prueba de análisis de IA fallida:',
  'command.ai.providerStatus': 'Estado del proveedor de IA',
  'command.ai.providerDetails': 'Detalles del proveedor',
  'command.ai.bestProvider': 'Mejor proveedor disponible: {{provider}}',
  'command.ai.available': 'Disponible',
  'command.ai.notFound': 'No encontrado',

  // Cache command
  'command.cache.clearingCaches': 'Limpiando cachés...',
  'command.cache.registryCacheCleared': 'Caché del registro limpiada',
  'command.cache.workspaceCacheCleared': 'Caché del workspace limpiada',
  'command.cache.aiCacheCleared': 'Caché de análisis de IA limpiada',
  'command.cache.registryCache': 'Caché del Registro',
  'command.cache.workspaceCache': 'Caché del Workspace',
  'command.cache.aiAnalysisCache': 'Caché de Análisis de IA',
  'command.cache.registryDescription':
    'Respuestas de API del registro NPM (info de paquetes, versiones)',
  'command.cache.workspaceDescription':
    'Datos del sistema de archivos del workspace (archivos package.json)',
  'command.cache.aiDescription': 'Resultados del análisis de dependencias con IA',
  'command.cache.statistics': 'Estadísticas de Caché',
  'command.cache.summary': 'Resumen',
  'command.cache.totalEntries': 'Entradas totales: {{count}}',
  'command.cache.totalSize': 'Tamaño total: {{size}}',
  'command.cache.overallHitRate': 'Tasa de aciertos general: {{rate}}%',
  'command.cache.entries': 'Entradas: {{count}}',
  'command.cache.size': 'Tamaño: {{size}}',
  'command.cache.hitRate': 'Tasa de aciertos: {{rate}}%',
  'command.cache.hitsAndMisses': 'Aciertos: {{hits}}, Fallos: {{misses}}',
  'command.cache.errorManaging': 'Error al gestionar caché:',
  'command.cache.stackTrace': 'Traza de pila:',
  'command.cache.noStackTrace': 'Sin traza de pila disponible',

  // Common messages
  'common.stackTrace': 'Traza de pila:',
  'common.noStackTrace': 'Sin traza de pila disponible',
  'common.yes': 'Sí',
  'common.no': 'No',
  'common.packagesCount': '{{count}} paquete(s)',

  // Security command
  'command.security.scanning': 'Escaneo de vulnerabilidades de seguridad',
  'command.security.severityFilter': 'Filtro de severidad: {{severity}}',
  'command.security.errorScanning': 'Error al realizar el escaneo de seguridad:',
  'command.security.snykNotFound': 'Snyk no encontrado. Instalar con: npm install -g snyk',
  'command.security.recommendations': 'Recomendaciones de seguridad:',
  'command.security.runWithFix': 'Ejecutar con --fix-vulns para aplicar correcciones automáticas',
  'command.security.noFixesAvailable': 'No hay correcciones de seguridad disponibles',
  'command.security.applyingFixes': 'Aplicando correcciones de seguridad...',
  'command.security.noAutoFixes': 'No hay correcciones automáticas disponibles',
  'command.security.fixesApplied': 'Correcciones de seguridad aplicadas exitosamente',
  'command.security.verifyingFixes':
    'Re-ejecutando escaneo de seguridad para verificar correcciones...',
  'command.security.allFixed':
    '¡Todas las vulnerabilidades críticas y de alta severidad han sido corregidas!',
  'command.security.fixesFailed': 'Error al aplicar correcciones de seguridad:',
  'command.security.noPackageJson': 'No se encontró package.json en {{path}}',
  'command.security.auditFailed': 'pnpm audit falló: {{message}}',
  'command.security.auditParseError': 'Error al analizar la salida de pnpm audit: {{error}}',
  'command.security.auditExitError': 'pnpm audit falló con estado {{status}}: {{error}}',
  'command.security.snykScanExitError': 'El escaneo de Snyk falló con estado {{status}}: {{error}}',
  'command.security.snykScanFailed': 'El escaneo de Snyk falló: {{message}}',
  'command.security.auditFixFailed': 'pnpm audit --fix falló con estado {{status}}',

  // Check command additions
  'command.check.errorChecking': 'Error al verificar dependencias:',
  'command.check.catalogLabel': 'Catálogo: {{catalog}}',
  'command.check.targetLabel': 'Objetivo: {{target}}',
  'command.check.catalogsChecked': '{{count}} catálogos verificados',
  'command.check.totalCatalogEntries': '{{count}} entradas de catálogo en total',

  // Init command additions
  'command.init.missingPackageJson': 'Falta: package.json',
  'command.init.missingWorkspaceYaml': 'Falta: pnpm-workspace.yaml',
  'command.init.creatingWorkspace': 'Creando estructura de workspace PNPM...',
  'command.init.workspaceCreated': 'Estructura de workspace PNPM creada',
  'command.init.useForceOverwrite': 'Use --force para sobrescribir la configuración existente',
  'command.init.errorInitializing': 'Error al inicializar la configuración:',
  'command.init.createdPackageJson': 'Creado: package.json',
  'command.init.createdWorkspaceYaml': 'Creado: pnpm-workspace.yaml',
  'command.init.createdPackagesDir': 'Creado: directorio packages/',

  // Theme command additions
  'command.theme.themeLabel': 'Tema:',
  'command.theme.custom': 'personalizado',
  'command.theme.default': 'predeterminado',

  // AI command additions
  'command.ai.providerLabel': 'Proveedor:',
  'command.ai.confidenceLabel': 'Confianza:',
  'command.ai.summaryLabel': 'Resumen:',
  'command.ai.pathLabel': 'Ruta:',
  'command.ai.versionLabel': 'Versión:',

  // Init command labels
  'command.init.configFileLabel': 'Archivo de configuración: {{path}}',
  'command.init.foundLabel': 'Encontrado: {{path}}',
  'command.init.createdLabel': 'Creado: {{path}}',

  // Theme command preview
  'command.theme.previewSuccess': 'Mensaje de éxito',
  'command.theme.previewWarning': 'Mensaje de advertencia',
  'command.theme.previewError': 'Mensaje de error',
  'command.theme.previewInfo': 'Mensaje de información',
  'command.theme.previewMajor': 'mayor',
  'command.theme.previewMinor': 'menor',
  'command.theme.previewPatch': 'parche',
  'command.theme.previewPackageUpdates': 'Ejemplos de actualización',
  'command.theme.previewStatusMessages': 'Mensajes de estado',
  'command.theme.previewProgressBar': 'Barra de progreso',
  'command.theme.previewPrerelease': 'prelanzamiento',
  'command.theme.previewCheckingDeps': 'Verificando dependencias...',
  'command.theme.previewUpdatesFound': '{{count}} actualizaciones',
  'command.theme.previewUpdateComplete': 'Actualización completada',
  'command.theme.previewPotentialIssue': 'Problema potencial',
  'command.theme.previewOperationFailed': 'Operación fallida',

  // Init command next steps
  'command.init.step1': '1. Revise y personalice la configuración:',
  'command.init.step2': '2. Agregue paquetes a su workspace:',
  'command.init.step2Commands': 'mkdir packages/my-app && cd packages/my-app\n   pnpm init',
  'command.init.step3': '3. Instale dependencias y verifique actualizaciones:',
  'command.init.step3Commands': 'pnpm install\n   pcu check',
  'command.init.step4': '4. Actualice dependencias de forma interactiva:',
  'command.init.step4Commands': 'pcu update --interactive',
  'command.init.step5': '5. Aprenda más sobre PNPM workspace y PCU:',

  // CLI messages
  'cli.runAgain': 'Por favor, ejecute el comando nuevamente para usar la versión actualizada.',
  'cli.checkingUpdates': 'Buscando actualizaciones...',
  'cli.latestVersion': 'es la última',
  'cli.available': 'disponible',
  'cli.unknownCommand': 'Comando desconocido: {{command}}',
  'cli.couldNotCheckUpdates': 'No se pudo verificar actualizaciones:',
  'cli.error': 'Error:',
  'cli.unexpectedError': 'Error inesperado:',
  'cli.fatalError': 'Error fatal:',
  'cli.cancelled': 'Cancelado.',
  'cli.updateAvailable': 'Actualización disponible: {{current}} → {{latest}}',
  'cli.updateHint': 'Ejecute "pcu self-update" para actualizar.',

  // Progress bar messages
  'progress.securityAnalyzing': 'Realizando análisis de seguridad...',
  'progress.securityCompleted': 'Análisis de seguridad completado',
  'progress.securityFailed': 'Análisis de seguridad fallido',
  'progress.operationFailed': 'Operación fallida',
  'progress.processing': 'Procesando...',
  'progress.success': 'ÉXITO',
  'progress.error': 'ERROR',
  'progress.warning': 'ADVERTENCIA',
  'progress.info': 'INFO',
  'progress.completed': 'completado',
  'progress.failed': 'fallido',
  'progress.steps': 'Pasos de progreso',
  'progress.allStepsCompleted': '¡Todos los pasos completados!',
  'progress.overallProgress': 'Progreso general',
  'progress.checkingPackages': 'Verificando {{count}} dependencias...',
  'progress.checkCompleteWithUpdates':
    '✅ ¡Verificación completa! Se encontraron {{count}} dependencias desactualizadas',
  'progress.checkCompleteNoUpdates':
    '✅ ¡Verificación completa! Todas las dependencias están actualizadas',
  'progress.checkingPackage': 'Verificando paquete: {{packageName}}',
  'progress.skippingPackage': 'Omitiendo paquete {{packageName}} (verificación fallida)',

  // Security command additions
  'command.security.criticalVulnsFound': '{{count}} vulnerabilidades críticas encontradas',
  'command.security.highImpactFix': 'Alto - Corrección de vulnerabilidad de seguridad',

  // CLI command descriptions
  'cli.description.main':
    'Herramienta CLI para verificar y actualizar dependencias del catálogo de workspace pnpm',
  'cli.description.check': 'verificar dependencias de catálogo desactualizadas',
  'cli.description.update': 'actualizar dependencias del catálogo',
  'cli.description.analyze': 'analizar el impacto de actualizar una dependencia específica',
  'cli.description.workspace': 'información y validación del workspace',
  'cli.description.theme': 'configurar tema de color',
  'cli.description.security': 'escaneo de vulnerabilidades de seguridad y correcciones automáticas',
  'cli.description.init': 'inicializar configuración PCU y workspace PNPM',
  'cli.description.ai': 'verificar estado y disponibilidad del proveedor de IA',
  'cli.description.cache': 'gestionar caché de PCU para datos de registro y workspace',
  'cli.description.rollback': 'revertir actualizaciones del catálogo a un estado anterior',
  'cli.description.watch': 'vigilar cambios y verificar actualizaciones',
  'cli.description.selfUpdate': 'actualizar pcu a la última versión',
  'cli.description.graph': 'visualizar relaciones de dependencias del catálogo',
  'cli.description.help': 'mostrar ayuda para el comando',

  // CLI option descriptions
  'cli.option.catalog': 'verificar solo catálogo específico',
  'cli.option.format': 'formato de salida: table, json, yaml, minimal',
  'cli.option.target': 'objetivo de actualización: latest, greatest, minor, patch, newest',
  'cli.option.prerelease': 'incluir versiones prerelease',
  'cli.option.include': 'incluir paquetes que coincidan con el patrón',
  'cli.option.exclude': 'excluir paquetes que coincidan con el patrón',
  'cli.option.interactive': 'modo interactivo para elegir actualizaciones',
  'cli.option.dryRun': 'previsualizar cambios sin escribir archivos',
  'cli.option.savePlan': 'guardar plan de ejecución en seco en archivo (JSON o YAML)',
  'cli.option.force': 'forzar actualizaciones incluso si son riesgosas',
  'cli.option.createBackup': 'crear archivos de respaldo antes de actualizar',
  'cli.option.noBackup': 'omitir creación de respaldo antes de actualizar',
  'cli.option.ai': 'habilitar análisis por lotes de IA para todas las actualizaciones',
  'cli.option.aiStatus': 'mostrar estado del proveedor de IA (predeterminado)',
  'cli.option.aiTest': 'probar conectividad del proveedor de IA',
  'cli.option.aiCacheStats': 'mostrar estadísticas de caché de análisis de IA',
  'cli.option.aiClearCache': 'limpiar caché de análisis de IA',
  'cli.option.provider': 'proveedor de IA: auto, claude, gemini, codex',
  'cli.option.analysisType': 'tipo de análisis de IA: impact, security, compatibility, recommend',
  'cli.option.skipCache': 'omitir caché de análisis de IA',
  'cli.option.noAi': 'deshabilitar análisis de IA',
  'cli.option.validate': 'validar configuración del workspace',
  'cli.option.stats': 'mostrar estadísticas del workspace',
  'cli.option.setTheme': 'establecer tema: default, modern, minimal, neon',
  'cli.option.listThemes': 'listar temas disponibles',
  'cli.option.audit': 'realizar escaneo npm audit (predeterminado: true)',
  'cli.option.fixVulns': 'corregir vulnerabilidades automáticamente',
  'cli.option.severity': 'filtrar por severidad: low, moderate, high, critical',
  'cli.option.includeDev': 'incluir dependencias de desarrollo en el escaneo',
  'cli.option.snyk': 'incluir escaneo Snyk (requiere snyk CLI)',
  'cli.option.forceOverwrite': 'sobrescribir archivo de configuración existente',
  'cli.option.full': 'generar configuración completa con todas las opciones',
  'cli.option.createWorkspace':
    'crear estructura de workspace PNPM si falta (predeterminado: true)',
  'cli.option.noCreateWorkspace': 'omitir creación de estructura de workspace PNPM',
  'cli.option.status': 'mostrar estado de todos los proveedores de IA (predeterminado)',
  'cli.option.test': 'probar análisis de IA con una solicitud de muestra',
  'cli.option.cacheStats': 'mostrar estadísticas de caché de análisis de IA',
  'cli.option.clearCache': 'limpiar caché de análisis de IA',
  'cli.option.clear': 'limpiar todas las entradas de caché',
  'cli.option.version': 'mostrar información de versión',
  'cli.option.verbose': 'habilitar registro detallado',
  'cli.option.workspace': 'ruta del directorio del workspace',
  'cli.option.noColor': 'deshabilitar salida en color',
  'cli.help.command': 'help [command]',
  'cli.help.description': 'mostrar ayuda del comando',
  'cli.help.option': 'mostrar información de ayuda',
  // Etiquetas de texto de ayuda de Commander.js
  'cli.help.usage': 'Uso:',
  'cli.help.arguments': 'Argumentos:',
  'cli.help.optionsTitle': 'Opciones:',
  'cli.help.commandsTitle': 'Comandos:',
  // Texto de ayuda personalizado - Sección de Grupos de opciones
  'cli.help.optionGroupsTitle': 'Grupos de opciones:',
  'cli.help.groupBasic': 'Básico:',
  'cli.help.groupFilter': 'Filtro:',
  'cli.help.groupOutput': 'Salida:',
  'cli.help.groupAI': 'IA:',
  'cli.help.groupInstall': 'Instalación:',
  // Texto de ayuda personalizado - Sección de Consejo
  'cli.help.tipLabel': 'Consejo:',
  'cli.help.tipContent':
    "Usa .pcurc.json para establecer valores predeterminados y reducir las opciones de línea de comandos.\n     Ejecuta 'pcu init' para crear un archivo de configuración, o visita https://pcu-cli.dev/{{locale}}/configuration",
  'cli.option.install': 'ejecutar pnpm install después de la actualización (por defecto: true)',
  'cli.option.noInstall': 'omitir pnpm install después de la actualización',
  'cli.option.changelog': 'mostrar registro de cambios para cada actualización',
  'cli.option.noChangelog': 'ocultar salida del registro de cambios',
  'cli.option.updateShorthand': 'atajo para comando update',
  'cli.option.checkShorthand': 'atajo para comando check',
  'cli.option.analyzeShorthand': 'atajo para comando analyze',
  'cli.option.workspaceShorthand': 'atajo para comando workspace',
  'cli.option.themeShorthand': 'atajo para comando theme',
  'cli.option.securityAudit': 'atajo para comando security',
  'cli.option.securityFix': 'atajo para comando security --fix-vulns',
  'cli.option.listBackups': 'listar copias de seguridad disponibles',
  'cli.option.restoreLatest': 'restaurar desde la copia de seguridad más reciente',
  'cli.option.deleteAllBackups': 'eliminar todas las copias de seguridad',
  'cli.option.debounce': 'retraso de debounce en milisegundos',
  'cli.option.clearConsole': 'limpiar consola antes de cada verificación',
  'cli.option.exitCode': 'salir con código 1 si hay actualizaciones disponibles (para CI/CD)',
  'cli.option.noSecurity': 'omitir comprobaciones de vulnerabilidades de seguridad',
  'cli.option.graphFormat': 'formato de salida: text, mermaid, dot, json',
  'cli.option.graphType': 'tipo de gráfico: catalog, package, full',

  // CLI argument descriptions
  'cli.argument.package': 'nombre del paquete',
  'cli.argument.version': 'nueva versión (predeterminado: latest)',
  'cli.argument.command': 'comando para obtener ayuda',

  // Interactive prompts
  'prompt.selectPackages': 'Seleccionar paquetes a actualizar:',
  'prompt.selectAtLeastOne': 'Por favor seleccione al menos un paquete',
  'prompt.allCatalogs': 'Todos los catálogos',
  'prompt.selectCatalog': 'Seleccionar catálogo a actualizar:',
  'prompt.selectUpdateStrategy': 'Seleccionar estrategia de actualización:',
  'prompt.strategyLatest': 'Última versión (recomendado)',
  'prompt.strategyGreatest': 'Versión más alta',
  'prompt.strategyMinor': 'Actualización menor (sin ruptura)',
  'prompt.strategyPatch': 'Solo parches (corrección de errores)',
  'prompt.strategyNewest': 'Lanzamiento más reciente',
  'prompt.selectPackage': 'Seleccionar paquete:',
  'prompt.selectWorkspace': 'Seleccionar workspace:',
  'prompt.browseDirectory': 'Explorar directorio...',
  'prompt.parentDirectory': '.. (directorio padre)',
  'prompt.currentDirectory': 'Usar directorio actual: {path}',
  'prompt.useAsWorkspace': '¿Usar {path} como workspace?',
  'prompt.configWizard': 'Asistente de configuración',
  'prompt.selectTheme': 'Seleccionar tema:',
  'prompt.themeDefault': 'Predeterminado (colores clásicos)',
  'prompt.themeModern': 'Moderno (gradientes suaves)',
  'prompt.themeMinimal': 'Mínimo (salida simple)',
  'prompt.themeNeon': 'Neón (alto contraste)',
  'prompt.enableInteractive': '¿Habilitar modo interactivo?',
  'prompt.createBackups': '¿Crear copias de seguridad antes de actualizar?',
  'prompt.defaultStrategy': 'Estrategia de actualización predeterminada:',
  'prompt.strategyLatestStable': 'Última versión estable',
  'prompt.strategyMinorUpdates': 'Solo actualizaciones menores',
  'prompt.strategyPatchUpdates': 'Solo actualizaciones de parche',
  'prompt.networkTimeout': 'Tiempo de espera de red (segundos):',
  'prompt.timeoutRequired': 'El tiempo de espera es requerido',
  'prompt.timeoutPositive': 'El tiempo de espera debe ser mayor que 0',
  'prompt.impactPreview': 'Vista previa de impacto',
  'prompt.packagesToUpdate': 'Paquetes a actualizar: {count}',
  'prompt.riskLevel': 'Nivel de riesgo: {level}',
  'prompt.affectedPackages': 'Paquetes afectados: {count}',
  'prompt.proceedWithUpdate': '¿Proceder con la actualización?',
  'prompt.retryOperation': 'Reintentar operación',
  'prompt.skipPackage': 'Omitir este paquete',
  'prompt.continueRemaining': 'Continuar con los restantes',
  'prompt.abortOperation': 'Abortar operación',
  'prompt.whatToDo': '¿Qué desea hacer?',
  'prompt.checkForUpdates': 'Buscar actualizaciones',
  'prompt.updateDependencies': 'Actualizar dependencias',
  'prompt.analyzeImpact': 'Analizar impacto',
  'prompt.showWorkspaceInfo': 'Mostrar información del workspace',
  'prompt.outputFormat': 'Formato de salida:',
  'prompt.formatTable': 'Tabla (detallado)',
  'prompt.formatJson': 'JSON',
  'prompt.formatYaml': 'YAML',
  'prompt.formatMinimal': 'Mínimo',
  'prompt.interactiveMode': '¿Modo interactivo?',
  'prompt.dryRunMode': '¿Modo de prueba?',
  'prompt.createBackup': '¿Crear copia de seguridad?',
  'prompt.includePrerelease': '¿Incluir versiones preliminares?',
  'prompt.warning': 'Advertencia:',
  'prompt.confirmOperation': '¿Está seguro de que desea {{operation}}?',
  'prompt.browsePath': 'Examinar: {{path}}',
  'prompt.securityUpdatesCount': '{{count}} actualizaciones de seguridad',
  'prompt.errorMessage': 'Error: {{error}}',
  'prompt.cancel': 'Cancelar',

  // Severity labels
  'severity.critical': 'Crítico',
  'severity.high': 'Alto',
  'severity.moderate': 'Moderado',
  'severity.low': 'Bajo',
  'severity.info': 'Info',
  'severity.total': 'Total',

  // Option group titles
  'optionGroup.global': 'Opciones globales',
  'optionGroup.output': 'Opciones de salida',
  'optionGroup.filtering': 'Opciones de filtrado',
  'optionGroup.update': 'Opciones de actualización',
  'optionGroup.registry': 'Opciones de registro',

  // AI Analysis Report
  'aiReport.title': '🤖 Informe de Análisis IA',
  'aiReport.provider': 'Proveedor:',
  'aiReport.analysisType': 'Tipo de análisis:',
  'aiReport.confidence': 'Confianza:',
  'aiReport.summary': '📋 Resumen',
  'aiReport.recommendations': '💡 Recomendaciones',
  'aiReport.breakingChanges': '⚠️  Cambios importantes',
  'aiReport.securityFixes': '🔒 Correcciones de seguridad',
  'aiReport.warnings': '⚡ Advertencias',
  'aiReport.details': '📝 Detalles',
  'aiReport.affectedPackages': '📦 Paquetes afectados',
  'aiReport.noPackagesAffected': 'No hay paquetes directamente afectados',
  'aiReport.generatedAt': 'Generado en: {{timestamp}}',
  'aiReport.processingTime': 'Tiempo de procesamiento: {{time}}ms',
  'aiReport.tokensUsed': 'Tokens utilizados: {{tokens}}',
  'aiReport.andMore': '... y {{count}} más',
  'aiReport.tablePackage': 'Paquete',
  'aiReport.tableVersionChange': 'Cambio de versión',
  'aiReport.tableAction': 'Acción',
  'aiReport.tableRisk': 'Riesgo',
  'aiReport.tableReason': 'Razón',

  // Theme preset descriptions
  'theme.preset.development': 'Colores brillantes para entornos de desarrollo',
  'theme.preset.production': 'Colores sutiles para entornos de producción',
  'theme.preset.presentation': 'Colores de alto contraste para presentaciones',
  'theme.preset.default': 'Colores equilibrados para uso general',

  // Validation messages (commandValidator.ts)
  'validation.catalogMustBeString': 'El nombre del catálogo debe ser una cadena',
  'validation.interactiveNotUsefulWithJson':
    'El modo interactivo no es útil con formato de salida JSON',
  'validation.verboseWithSilent': 'No se puede usar --verbose y --silent juntos',
  'validation.interactiveWithDryRunError': 'No se puede usar --interactive con --dry-run',
  'validation.forceWithoutBackup':
    'Usando --force sin respaldo. Considere usar --create-backup por seguridad',
  'validation.majorUpdatesWarning':
    'Las actualizaciones mayores pueden contener cambios importantes. Considere usar --interactive o --force',
  'validation.patternsOverlap':
    'Algunos patrones aparecen tanto en listas de inclusión como exclusión',
  'validation.catalogRequired': 'El nombre del catálogo es requerido',
  'validation.catalogNoPathSeparators':
    'El nombre del catálogo no puede contener separadores de ruta',
  'validation.packageRequired': 'El nombre del paquete es requerido',
  'validation.invalidPackageNameFormat': 'Formato de nombre de paquete inválido',
  'validation.invalidVersionFormat':
    'Formato de versión inválido. Use versionado semántico (ej. 1.2.3)',
  'validation.multipleWorkspaceActions':
    'No se pueden usar múltiples acciones de workspace simultáneamente',
  'validation.colorWithNoColor': 'No se puede usar --color y --no-color juntos',
  'validation.deprecatedOption':
    'La opción "{{option}}" está obsoleta. Use "{{replacement}}" en su lugar',
  'validation.configNotFound': 'Archivo de configuración no encontrado: {{path}}',
  'validation.failedToLoadJsConfig': 'Error al cargar archivo de configuración JS: {{error}}',
  'validation.failedToParseJsonConfig':
    'Error al analizar archivo de configuración JSON: {{error}}',
  'validation.configMustBeObject': 'La configuración debe ser un objeto',
  'validation.registryMustBeObject': 'La configuración del registro debe ser un objeto',
  'validation.updateMustBeObject': 'La configuración de actualización debe ser un objeto',
  'validation.outputMustBeObject': 'La configuración de salida debe ser un objeto',
  'validation.unknownConfigKeys': 'Claves de configuración desconocidas: {{keys}}',
  'validation.failedToValidateConfig': 'Error al validar la configuración: {{error}}',
  'validation.interactiveWithDryRunConflict': 'No se puede usar --interactive con --dry-run',
  'validation.multipleWorkspaceActionsConflict':
    'No se pueden usar múltiples acciones de workspace simultáneamente',
  'validation.verboseWithSilentConflict': 'No se puede usar --verbose y --silent al mismo tiempo',

  // Suggestion messages
  'suggestion.specifyWorkspace': 'Use -w o --workspace para especificar el directorio',
  'suggestion.jsonAlreadyDetailed': 'El formato JSON ya incluye todos los detalles',
  'suggestion.useDryRunFirst': 'Use --dry-run para previsualizar cambios primero',
  'suggestion.addPrereleaseWithGreatest':
    'Considere agregar --prerelease al usar --target greatest',
  'suggestion.useJsonForProgrammatic': 'Use --format json para análisis programático',
  'suggestion.useValidateOrStats':
    'Use --validate para verificar workspace o --stats para estadísticas',
  'suggestion.globalVerboseEnabled': 'Modo verbose global habilitado via PCU_VERBOSE',

  // Table headers (outputFormatter.ts)
  'table.header.package': 'Paquete',
  'table.header.current': 'Actual',
  'table.header.latest': 'Última',
  'table.header.type': 'Tipo',
  'table.header.packagesCount': 'Paquetes',
  'table.header.catalog': 'Catálogo',
  'table.header.from': 'Desde',
  'table.header.to': 'Hasta',
  'table.header.path': 'Ruta',
  'table.header.dependencyType': 'Tipo de dependencia',
  'table.header.risk': 'Riesgo',
  'table.header.metric': 'Métrica',
  'table.header.count': 'Cantidad',
  'table.header.severity': 'Severidad',
  'table.header.title': 'Título',
  'table.header.fixAvailable': 'Fix disponible',

  // Format labels (outputFormatter.ts)
  'format.workspace': 'Workspace',
  'format.path': 'Ruta',
  'format.allUpToDate': 'Todas las dependencias están actualizadas',
  'format.foundOutdated': 'Se encontraron {{count}} dependencias desactualizadas',
  'format.catalog': 'Catálogo',
  'format.updateCompleted': 'Actualización completada',
  'format.updateFailed': 'Actualización fallida',
  'format.updatedDeps': 'Dependencias actualizadas',
  'format.skippedDeps': 'Dependencias omitidas',
  'format.errorsOccurred': 'Errores ocurridos',
  'format.updatedCount': 'Actualizados: {{count}}',
  'format.errorCount': 'Errores: {{count}}',
  'format.impactAnalysis': 'Análisis de impacto',
  'format.updateInfo': 'Info de actualización',
  'format.riskLevel': 'Nivel de riesgo',
  'format.affectedPackages': 'Paquetes afectados',
  'format.securityImpact': 'Impacto de seguridad',
  'format.fixesVulns': 'Corrige {{count}} vulnerabilidades',
  'format.introducesVulns': 'Puede introducir {{count}} vulnerabilidades',
  'format.recommendations': 'Recomendaciones',
  'format.workspaceValidation': 'Validación del workspace',
  'format.status': 'Estado',
  'format.valid': 'VÁLIDO',
  'format.invalid': 'INVÁLIDO',
  'format.workspaceInfo': 'Información del workspace',
  'format.name': 'Nombre',
  'format.packages': 'Paquetes',
  'format.catalogs': 'Catálogos',
  'format.errors': 'Errores',
  'format.warnings': 'Advertencias',
  'format.workspaceStats': 'Estadísticas del workspace',
  'format.securityReport': 'Informe de seguridad',
  'format.scanDate': 'Fecha de escaneo',
  'format.tools': 'Herramientas',
  'format.summary': 'Resumen',
  'format.vulnerabilities': 'Vulnerabilidades',
  'format.noVulnsFound': 'No se encontraron vulnerabilidades',
  'format.packagesAffected': 'Paquetes afectados',
  'format.foundOutdatedDependencies': 'Se encontraron {{count}} dependencias desactualizadas',
  'format.catalogLabel': 'Catálogo',
  'format.updateLabel': 'Actualización',
  'format.typeLabel': 'Tipo',
  'format.updateCompletedSuccessfully': 'Actualización completada exitosamente',
  'format.updateCompletedWithErrors': 'Actualización completada con {{count}} errores',
  'format.updatedDependenciesTitle': 'Dependencias actualizadas',
  'format.skippedDependencies': 'Se omitieron {{count}} dependencias',
  'format.fixesVulnerabilities': 'Corrige {{count}} vulnerabilidades',
  'format.introducesVulnerabilities': 'Introduce {{count}} vulnerabilidades',
  'format.workspaceInformation': 'Información del workspace',
  'format.workspaceStatistics': 'Estadísticas del workspace',
  'format.packagesCount': '{{count}} paquetes',
  'format.catalogsCount': '{{count}} catálogos',
  'format.noUpdatesPlanned': 'No hay actualizaciones planificadas',
  'format.plannedUpdates': 'Actualizaciones planificadas: {{count}}',
  'format.versionConflicts': 'Conflictos de versión',
  'format.recommendation': 'Recomendación',
  'format.conflictsDetected': 'conflictos de versión detectados',

  // Table headers
  'table.header.new': 'Nueva',

  // Statistics labels (workspaceCommand.ts)
  'stats.totalPackages': 'Paquetes totales',
  'stats.packagesWithCatalogRefs': 'Paquetes con referencias de catálogo',
  'stats.totalCatalogs': 'Catálogos totales',
  'stats.catalogEntries': 'Entradas del catálogo',
  'stats.totalDependencies': 'Dependencias totales',
  'stats.catalogReferences': 'Referencias del catálogo',
  'stats.dependencies': 'Dependencias',
  'stats.devDependencies': 'Dependencias de desarrollo',
  'stats.peerDependencies': 'Dependencias de pares',
  'stats.optionalDependencies': 'Dependencias opcionales',

  // Unit labels (cacheCommand.ts)
  'unit.bytes': 'B',
  'unit.kilobytes': 'KB',
  'unit.megabytes': 'MB',
  'unit.gigabytes': 'GB',

  // Global option descriptions (globalOptions.ts)
  'option.workspacePath': 'ruta del directorio workspace',
  'option.verboseLogging': 'habilitar registro detallado',
  'option.noColorOutput': 'deshabilitar salida con colores',
  'option.registryUrl': 'URL del registro NPM',
  'option.timeout': 'tiempo de espera en milisegundos',
  'option.configPath': 'ruta al archivo de configuración',
  'option.catalogOnly': 'verificar solo catálogo específico',
  'option.outputFormat': 'formato de salida',
  'option.updateTarget': 'objetivo de actualización',
  'option.prereleaseVersions': 'incluir versiones preliminares',
  'option.includePattern': 'incluir paquetes que coincidan con el patrón',
  'option.excludePattern': 'excluir paquetes que coincidan con el patrón',
  'option.interactiveMode': 'modo interactivo para elegir actualizaciones',
  'option.dryRunPreview': 'previsualizar cambios sin escribir archivos',
  'option.forceRisky': 'forzar actualizaciones aunque sean riesgosas',
  'option.backupFiles': 'crear archivos de respaldo antes de actualizar',
  'option.aiAnalysis': 'habilitar análisis con IA',
  'option.aiProvider': 'proveedor de IA a usar',
  'option.analysisTypeOpt': 'tipo de análisis de IA',
  'option.skipAiCache': 'omitir caché de análisis de IA',
  'option.validateWorkspace': 'validar configuración del workspace',
  'option.showStats': 'mostrar estadísticas del workspace',
  'option.showInfo': 'mostrar información del workspace',

  // Interactive mode titles
  'interactive.check.title': 'Comando Check - Modo Interactivo',
  'interactive.update.title': 'Comando Update - Modo Interactivo',
  'interactive.analyze.title': 'Comando Analyze - Modo Interactivo',
  'interactive.workspace.title': 'Comando Workspace - Modo Interactivo',
  'interactive.theme.title': 'Comando Theme - Modo Interactivo',
  'interactive.security.title': 'Comando Security - Modo Interactivo',
  'interactive.init.title': 'Comando Init - Modo Interactivo',
  'interactive.ai.title': 'Comando AI - Modo Interactivo',
  'interactive.cache.title': 'Comando Cache - Modo Interactivo',
  'interactive.rollback.title': 'Comando Rollback - Modo Interactivo',
  'interactive.watch.title': 'Comando Watch - Modo Interactivo',

  // Interactive common choices - format
  'interactive.choice.format.table': 'Tabla (predeterminado)',
  'interactive.choice.format.json': 'JSON',
  'interactive.choice.format.yaml': 'YAML',
  'interactive.choice.format.minimal': 'Mínimo',

  // Interactive common choices - target
  'interactive.choice.target.latest': 'Última versión (predeterminado)',
  'interactive.choice.target.greatest': 'Versión más alta',
  'interactive.choice.target.minor': 'Actualización menor',
  'interactive.choice.target.patch': 'Actualización de parche',
  'interactive.choice.target.newest': 'Publicación más reciente',

  // Interactive common choices - severity
  'interactive.choice.severity.low': 'Baja',
  'interactive.choice.severity.medium': 'Media y superior',
  'interactive.choice.severity.high': 'Alta',
  'interactive.choice.severity.critical': 'Crítica',
  'interactive.choice.severity.all': 'Todas las severidades',

  // Interactive common choices - analysis type
  'interactive.choice.analysisType.impact': 'Análisis de impacto',
  'interactive.choice.analysisType.security': 'Análisis de seguridad',
  'interactive.choice.analysisType.compatibility': 'Análisis de compatibilidad',
  'interactive.choice.analysisType.recommend': 'Análisis de recomendación',

  // Interactive common choices - provider
  'interactive.choice.provider.auto': 'Automático (predeterminado)',
  'interactive.choice.provider.claude': 'Claude',
  'interactive.choice.provider.gemini': 'Gemini',
  'interactive.choice.provider.codex': 'Codex',

  // Interactive common choices - theme
  'interactive.choice.theme.default': 'Predeterminado',
  'interactive.choice.theme.modern': 'Moderno',
  'interactive.choice.theme.minimal': 'Mínimo',
  'interactive.choice.theme.neon': 'Neón',
  'interactive.choice.theme.ocean': 'Océano',
  'interactive.choice.theme.forest': 'Bosque',

  // Interactive prompts - check command
  'interactive.check.catalogName': 'Nombre del catálogo (vacío para todos):',
  'interactive.check.outputFormat': 'Formato de salida:',
  'interactive.check.updateTarget': 'Objetivo de actualización:',
  'interactive.check.includePrerelease': '¿Incluir versiones preliminares?',
  'interactive.check.includePatterns':
    'Patrones a incluir (separados por comas, vacío para todos):',
  'interactive.check.excludePatterns':
    'Patrones a excluir (separados por comas, vacío para ninguno):',
  'interactive.check.exitCode': '¿Salir con código 1 si hay actualizaciones disponibles (para CI)?',

  // Interactive prompts - update command
  'interactive.update.catalogName': 'Nombre del catálogo (vacío para todos):',
  'interactive.update.outputFormat': 'Formato de salida:',
  'interactive.update.updateTarget': 'Objetivo de actualización:',
  'interactive.update.includePrerelease': '¿Incluir versiones preliminares?',
  'interactive.update.includePatterns':
    'Patrones a incluir (separados por comas, vacío para todos):',
  'interactive.update.excludePatterns':
    'Patrones a excluir (separados por comas, vacío para ninguno):',
  'interactive.update.dryRun': '¿Simulación (sin cambios)?',
  'interactive.update.force': '¿Forzar actualización (aunque sea riesgoso)?',
  'interactive.update.createBackup': '¿Crear respaldo antes de actualizar?',
  'interactive.update.useAi': '¿Habilitar análisis de IA?',
  'interactive.update.aiProvider': 'Proveedor de IA:',
  'interactive.update.analysisType': 'Tipo de análisis:',
  'interactive.update.runInstall': '¿Ejecutar pnpm install después de actualizar?',
  'interactive.update.showChangelog': '¿Mostrar registro de cambios?',

  // Interactive prompts - analyze command
  'interactive.analyze.packageName': 'Nombre del paquete:',
  'interactive.analyze.packageNameRequired': 'El nombre del paquete es requerido',
  'interactive.analyze.catalogName': 'Nombre del catálogo (vacío para detección automática):',
  'interactive.analyze.targetVersion': 'Nueva versión (vacío para la última):',
  'interactive.analyze.outputFormat': 'Formato de salida:',
  'interactive.analyze.useAi': '¿Habilitar análisis de IA?',
  'interactive.analyze.aiProvider': 'Proveedor de IA:',
  'interactive.analyze.analysisType': 'Tipo de análisis:',

  // Interactive prompts - workspace command
  'interactive.workspace.validate': '¿Validar workspace?',
  'interactive.workspace.stats': '¿Mostrar estadísticas?',

  // Interactive prompts - theme command
  'interactive.theme.choose': 'Seleccionar tema:',

  // Interactive prompts - security command
  'interactive.security.action': '¿Ejecutar npm audit?',
  'interactive.security.severity': 'Severidad mínima:',
  'interactive.security.includeDev': '¿Incluir dependencias de desarrollo?',
  'interactive.security.useSnyk': '¿Usar Snyk (requiere CLI)?',
  'interactive.security.outputFormat': 'Formato de salida:',

  // Interactive prompts - init command
  'interactive.init.overwrite': '¿Sobrescribir configuración existente?',
  'interactive.init.createWorkspace': '¿Crear estructura de workspace PNPM?',

  // Interactive prompts - ai command

  // Interactive prompts - cache command

  // Interactive prompts - rollback command

  // Interactive prompts - watch command
  'interactive.watch.debounce': 'Retardo de rebote (ms):',
  'interactive.watch.debouncePositive': 'El retardo de rebote debe ser positivo',
  'interactive.watch.clearConsole': '¿Limpiar consola en cada verificación?',

  // Missing interactive keys
  'interactive.update.mode': 'Modo de actualización:',
  'interactive.update.mode.interactive': 'Selección interactiva (elegir paquetes)',
  'interactive.update.mode.dryRun': 'Simulación (solo vista previa)',
  'interactive.update.mode.apply': 'Aplicar todas las actualizaciones',
  'interactive.workspace.actions': '¿Qué le gustaría hacer?',
  'interactive.workspace.outputFormat': 'Formato de salida:',
  'interactive.theme.action': '¿Qué le gustaría hacer?',
  'interactive.theme.action.set': 'Seleccionar y establecer un tema',
  'interactive.theme.action.list': 'Listar temas disponibles',
  'interactive.security.action.audit': 'Auditar vulnerabilidades',
  'interactive.security.action.fix': 'Corregir vulnerabilidades',
  'interactive.security.action.both': 'Auditar y corregir',
  'interactive.init.mode': 'Modo de inicialización:',
  'interactive.init.mode.quick': 'Configuración rápida (mínima)',
  'interactive.init.mode.full': 'Configuración completa (todas las opciones)',
  'interactive.ai.action': 'Acción de gestión de IA:',
  'interactive.ai.action.status': 'Verificar estado de IA',
  'interactive.ai.action.test': 'Probar conexión de IA',
  'interactive.ai.action.cacheStats': 'Mostrar estadísticas de caché',
  'interactive.ai.action.clearCache': 'Limpiar caché de IA',
  'interactive.cache.action': 'Acción de caché:',
  'interactive.cache.action.stats': 'Mostrar estadísticas de caché',
  'interactive.cache.action.clear': 'Limpiar caché',
  'interactive.rollback.action': 'Acción de reversión:',
  'interactive.rollback.action.list': 'Listar copias de seguridad disponibles',
  'interactive.rollback.action.latest': 'Restaurar última copia de seguridad',
  'interactive.rollback.action.deleteAll': 'Eliminar todas las copias de seguridad',
  'interactive.watch.catalogName': 'Nombre del catálogo a vigilar (vacío para todos):',
  'interactive.watch.updateTarget': 'Objetivo de actualización:',
  'interactive.watch.includePrerelease': '¿Incluir versiones preliminares?',
  'interactive.watch.outputFormat': 'Formato de salida:',

  // Interactive cancelled message
  'interactive.cancelled': 'Operación cancelada',

  // Interactive command subtitles, intros, and completion messages
  'interactive.check.subtitle': 'Verificar versiones desactualizadas de dependencias del catálogo',
  'interactive.check.intro': 'Por favor, configure las opciones de verificación',
  'interactive.check.ready': '¡Configuración completada! Iniciando verificación...',
  'interactive.check.catalogPlaceholder': 'ej. default, react',
  'interactive.check.patternPlaceholder': 'ej. react*, @types/*',

  'interactive.update.subtitle': 'Actualizar dependencias del catálogo a nuevas versiones',
  'interactive.update.intro': 'Por favor, configure las opciones de actualización',
  'interactive.update.ready': '¡Configuración completada! Iniciando actualización...',
  'interactive.update.catalogPlaceholder': 'ej. default, react',
  'interactive.update.mode.interactiveHint': 'Seleccionar manualmente los paquetes a actualizar',
  'interactive.update.mode.dryRunHint': 'Vista previa de cambios sin modificar',
  'interactive.update.mode.applyHint': 'Aplicar todas las actualizaciones disponibles directamente',

  'interactive.analyze.subtitle': 'Analizar el impacto de actualizaciones de paquetes',
  'interactive.analyze.intro': 'Por favor, configure las opciones de análisis',
  'interactive.analyze.ready': '¡Configuración completada! Iniciando análisis...',
  'interactive.analyze.packagePlaceholder': 'ej. lodash, react',
  'interactive.analyze.versionPlaceholder': 'Vacío para última versión, ej. 18.2.0, ^19.0.0',
  'interactive.analyze.catalogPlaceholder': 'Vacío para detección automática',

  'interactive.workspace.subtitle': 'Ver y validar información del workspace',
  'interactive.workspace.intro': 'Por favor, seleccione una acción',
  'interactive.workspace.ready': '¡Configuración completada! Ejecutando acción...',
  'interactive.workspace.validateHint': 'Validar configuración del workspace',
  'interactive.workspace.statsHint': 'Mostrar estadísticas del workspace',

  'interactive.theme.subtitle': 'Configurar tema de colores del CLI',
  'interactive.theme.intro': 'Por favor, seleccione una acción de tema',
  'interactive.theme.ready': '¡Configuración completada! Aplicando tema...',

  'interactive.security.subtitle': 'Escanear y corregir vulnerabilidades de seguridad',
  'interactive.security.intro': 'Por favor, configure las opciones de seguridad',
  'interactive.security.ready': '¡Configuración completada! Iniciando escaneo de seguridad...',

  'interactive.init.subtitle': 'Inicializar configuración de PCU',
  'interactive.init.intro': 'Por favor, seleccione el modo de inicialización',
  'interactive.init.ready': '¡Configuración completada! Inicializando...',

  'interactive.cache.subtitle': 'Administrar caché de PCU',
  'interactive.cache.intro': 'Por favor, seleccione una acción de caché',
  'interactive.cache.ready': '¡Configuración completada! Ejecutando acción...',

  'interactive.rollback.subtitle': 'Revertir a una versión anterior',
  'interactive.rollback.intro': 'Por favor, seleccione una acción de reversión',
  'interactive.rollback.ready': '¡Configuración completada! Iniciando reversión...',

  'interactive.watch.subtitle': 'Vigilar y verificar actualizaciones de dependencias',
  'interactive.watch.intro': 'Por favor, configure las opciones de vigilancia',
  'interactive.watch.ready': '¡Configuración completada! Iniciando modo de vigilancia...',
  'interactive.watch.catalogPlaceholder': 'ej. default, react',

  // Interactive choice hints - format
  'interactive.choice.format.tableHint': 'Mejor para visualización en terminal',
  'interactive.choice.format.jsonHint': 'Mejor para procesamiento programático',
  'interactive.choice.format.yamlHint': 'Mejor para archivos de configuración',
  'interactive.choice.format.minimalHint': 'Mostrar solo información clave',

  // Interactive choice hints - target
  'interactive.choice.target.latestHint': 'Recomendado, última versión estable',
  'interactive.choice.target.greatestHint': 'Incluye versiones preliminares',
  'interactive.choice.target.minorHint': 'Seguro, compatible hacia atrás',
  'interactive.choice.target.patchHint': 'Más seguro, solo correcciones de errores',
  'interactive.choice.target.newestHint': 'Ordenado por fecha de lanzamiento',

  // Interactive action hints
  'interactive.workspace.action.validateHint':
    'Verificar problemas en la configuración del workspace',
  'interactive.workspace.action.statsHint': 'Mostrar estadísticas detalladas del workspace',

  'interactive.theme.action.setHint': 'Elegir y aplicar un nuevo tema',
  'interactive.theme.action.listHint': 'Mostrar todos los temas disponibles',

  'interactive.security.action.auditHint': 'Escanear vulnerabilidades de seguridad',
  'interactive.security.action.fixHint': 'Corregir vulnerabilidades automáticamente',
  'interactive.security.action.bothHint': 'Escanear y corregir en un solo paso',

  'interactive.init.mode.quickHint': 'Configuración rápida con valores predeterminados',
  'interactive.init.mode.fullHint': 'Configurar todas las opciones disponibles',

  'interactive.cache.action.statsHint': 'Mostrar estadísticas de uso de caché',
  'interactive.cache.action.clearHint': 'Limpiar todos los datos en caché',

  'interactive.rollback.action.listHint': 'Mostrar todas las copias de seguridad disponibles',
  'interactive.rollback.action.latestHint': 'Restaurar la copia de seguridad más reciente',
  'interactive.rollback.action.deleteAllHint': 'Eliminar todos los archivos de copia de seguridad',

  // Update reason messages (DOC-001: i18n for update reasons)
  'update.reason.security': 'Actualización de seguridad disponible',
  'update.reason.major': 'Actualización de versión mayor disponible',
  'update.reason.minor': 'Actualización de versión menor disponible',
  'update.reason.patch': 'Actualización de parche disponible',
  'update.reason.default': 'Actualización disponible',
}
