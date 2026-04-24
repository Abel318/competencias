# Entrenador de entrevista (migrado a GitHub Pages)

Este repositorio incluye una versión **cliente (HTML único)** del entrenador de entrevista para evitar bloqueos de permisos típicos en Apps Script embebido.

## Ejecutar

1. Sube `index.html` al repositorio.
2. Activa **GitHub Pages** (Settings → Pages).
3. Abre la URL pública `https://...github.io/...`.
4. Permite cámara y micrófono en el candado del navegador.

## Qué mantiene esta versión

- Activación de cámara y detección de manos (MediaPipe).
- Activación de micrófono, transcripción y grabación de audio.
- Conversión local de audio a MP3 (lamejs).
- Integración con prompt para ChatGPT (copiar/pegar).
- TTS local con `speechSynthesis`.
- Exportación local a TXT y PDF.

## Qué cambia respecto a Apps Script

- No usa `google.script.run`.
- No guarda en Google Sheets ni envía email automáticamente.
- No llama a Cloud Vision / Cloud TTS desde servidor.

Si quieres recuperar esas funciones, puedes conectarlo luego a un backend propio (Cloud Run, Supabase, Firebase Functions, etc.).
