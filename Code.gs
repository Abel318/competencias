/**
 * Entrevista de Trabajo + Lenguaje No Verbal – SAE (SIN API OpenAI, v4.2 manos MediaPipe)
 * - Módulo VERBAL:
 *    · Prompt integrado → entrevista mejorada + feedback (verbal + no verbal)
 *    · Conversión del audio original a MP3 en el cliente (lamejs)
 *    · TTS de la entrevista mejorada y del feedback (Google Cloud TTS)
 *    · PDF export (Google Docs → PDF → base64 al cliente)
 *    · Email con tres MP3: original + entrevista mejorada + feedback
 *    · Limpieza de símbolos/emoji antes de sintetizar para evitar “leer asterisco/emoji”
 *
 * - Módulo NO VERBAL:
 *    · Google Cloud Vision (cara) vía FACE_DETECTION
 *    · Manos vía MediaPipe Hands en el cliente
 *    · Métricas de cara, manos, centrado, movimiento
 *    · Análisis de voz local (ritmo, pausas, volumen)
 *    · Genera un RESUMEN NO VERBAL que se copia al módulo VERBAL
 */

// ⚠️ Pega aquí tu API key de Cloud Vision (o usa PropertiesService si prefieres)
const VISION_API_KEY = 'AIzaSyCx94UeflOp5XU6EY-K1Yov2WE7FBN3sos'; // <-- AJUSTA TU API KEY

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Entrevista de Trabajo – Verbal + No Verbal (SAE)')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * NUEVO: llamada automática a OpenAI API para evitar copiado/pegado manual.
 * Requiere Script Property: OPENAI_API_KEY
 */
function generarAnalisisIntegradoOpenAI(verbal, nonVerbal) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('Falta OPENAI_API_KEY en Script Properties.');
  }

  const discurso = (verbal || '').trim();
  const noVerbal = (nonVerbal || '').trim();
  if (!discurso) {
    throw new Error('Falta el discurso original (transcripción).');
  }

  const prompt = buildPromptIntegratedServer_(discurso, noVerbal);

  const payload = {
    model: 'gpt-4.1-mini',
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: 'Eres un/a orientador/a laboral del SAE experto/a en entrevistas y lenguaje no verbal. Respeta el formato pedido.'
      },
      { role: 'user', content: prompt }
    ]
  };

  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Error OpenAI (' + code + '): ' + text);
  }

  const json = JSON.parse(text);
  const out = json?.choices?.[0]?.message?.content;
  if (!out) {
    throw new Error('OpenAI no devolvió texto utilizable. Respuesta: ' + text);
  }

  return out;
}

function buildPromptIntegratedServer_(verbal, nonVerbal) {
  return `[ROL/SISTEMA]
Eres un/a orientador/a laboral del Servicio Andaluz de Empleo (SAE), experto/a en entrevistas, lenguaje no verbal y empleabilidad.
Tu tarea es mejorar LAS RESPUESTAS dadas por la persona en una entrevista simulada, combinando:

1) Lenguaje verbal: el texto literal de preguntas y respuestas
2) Lenguaje no verbal: el resumen técnico generado por el módulo de cámara (expresión facial, postura de cabeza, gestos de manos, centrado en el encuadre, ritmo y volumen de voz)

Devuelve un informe INTEGRADO (verbal + no verbal) y reescribe las respuestas manteniendo las mismas preguntas. Sé claro, accionable y breve.

Devuelve EXACTAMENTE estos bloques, con estos encabezados y en este orden:

======================================================================
== RESUMEN INTEGRADO (perfil + contexto) ==
• Resume en 6–8 líneas:
  – Qué perfil y objetivo profesional transmite la persona
  – Qué competencia quiere potenciar (si se deduce)
  – Qué situación general reflejan el discurso y la comunicación no verbal
  – 2 fortalezas globales detectadas
  – 2 riesgos o áreas de mejora globales

======================================================================
== ENTREVISTA MEJORADA (mismas preguntas, respuestas optimizadas) ==
Reescribe cada respuesta para que sea más clara y convincente, manteniendo el orden y el texto de las preguntas. Máx. 90–120 palabras por respuesta y tono profesional.

======================================================================
== FEEDBACK VERBAL (cómo mejorar el discurso) ==
Genera un análisis de 8–12 líneas sobre:
• Claridad y estructura
• Orden lógico
• Uso de logros y métricas
• Lenguaje y tono
• CTA y cierres
• 3 fortalezas verbales
• 3 mejoras inmediatas con ejemplos de cómo reformular frases

======================================================================
== FEEDBACK NO VERBAL (cara, manos, postura, voz) ==
Genera un análisis profesional basado solo en los datos del módulo no verbal:
• Expresión facial: apertura, sonrisa, tensión
• Orientación de cabeza: frontalidad, estabilidad, giros
• Centrado en el encuadre
• Manos: presencia, amplitud, cercanía a la cara, posibles bloqueos
• Voz: ritmo, pausas, volumen, variación
• Incluye 3 fortalezas y 3 áreas de mejora con pautas muy concretas

======================================================================
== RECOMENDACIONES SAE (integradas) ==
Ofrece 5 recomendaciones prácticas y realistas que combinen lo verbal + lo no verbal, por ejemplo:
• Cómo abrir y cerrar respuestas
• Cómo modular voz y mirada
• Cómo usar manos para reforzar ideas
• Cómo estructurar logros
• Cómo dar una imagen profesional en 60 segundos
Incluye frases modelo aplicables directamente en entrevistas.

======================================================================
== DATOS ANALIZADOS ==
Incluye el contenido EXACTO recibido:

[DISCURSO ORIGINAL]
"""${verbal}"""

[ANÁLISIS NO VERBAL]
"""${nonVerbal}"""`;
}


/**
 * NUEVO: transcribe audio original con OpenAI (fallback cuando no llega transcript desde popup).
 * Recibe base64 y mimeType (ej: audio/webm) y devuelve texto plano.
 */
function transcribirAudioOriginalOpenAI(audioBase64, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY en Script Properties.');
  if (!audioBase64) throw new Error('Audio base64 vacío.');

  const bytes = Utilities.base64Decode(audioBase64);
  const ext = (mimeType || 'audio/webm').includes('mp3') ? 'mp3' : 'webm';
  const blob = Utilities.newBlob(bytes, mimeType || 'audio/webm', 'audio_original.' + ext);

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'post',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: {
      model: 'gpt-4o-mini-transcribe',
      file: blob,
      language: 'es',
      response_format: 'text'
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Error transcripción OpenAI (' + code + '): ' + body);
  }

  return (body || '').trim();
}

/** TTS Google Cloud → MP3 base64 */
function sintetizarTextoMejorado(texto, voiceName) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_TTS_API_KEY');
  if (!apiKey) throw new Error('Falta GOOGLE_TTS_API_KEY en Script Properties.');

  const name = voiceName || 'es-ES-Neural2-C';
  const ssml = `<speak><prosody rate="fast" pitch="+6%">${texto}</prosody></speak>`;

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
  const payload = JSON.stringify({
    input:       { ssml },
    voice:       { languageCode: 'es-ES', name },
    audioConfig: { audioEncoding: 'MP3' }
  });

  const response = UrlFetchApp.fetch(url, {
    method:      'POST',
    contentType: 'application/json',
    payload,
    muteHttpExceptions: true
  });
  const result = JSON.parse(response.getContentText());
  if (!result.audioContent) {
    throw new Error('TTS no devolvió audioContent: ' + response.getContentText());
  }
  return result.audioContent; // base64 MP3
}

/**
 * Guardado en hoja:
 *   Fecha, hora, institución,
 *   Original, entrevista mejorada, Feedback (verbal + no verbal integrado),
 *   Secuencia completa (incluye resumen no verbal al final).
 */
function saveEntry(institucion, original, improvedInterview, feedbackText, fullSeq) {
  const sheetId = '1dJWhH43AhlU2ZOH7o0A5WVBXh5Z9nXw9ZmpDi23EHso'; // ajusta si procede
  const sheet   = SpreadsheetApp.openById(sheetId).getActiveSheet();
  const now     = new Date();
  const tz      = Session.getScriptTimeZone();

  sheet.appendRow([
    Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    Utilities.formatDate(now, tz, 'HH:mm:ss'),
    institucion,
    original,
    improvedInterview,
    feedbackText || '',
    fullSeq
  ]);
}

/** Email con 3 MP3: original + entrevista mejorada + feedback */
function sendAudioByEmail(emailDest, originalMp3B64, improvedMp3B64, feedbackMp3B64) {
  if (!emailDest) throw new Error('Email destinatario no proporcionado.');

  const attachments = [];

  if (originalMp3B64) {
    attachments.push(
      Utilities.newBlob(Utilities.base64Decode(originalMp3B64), 'audio/mp3', 'audio_original.mp3')
    );
  }

  if (improvedMp3B64) {
    attachments.push(
      Utilities.newBlob(Utilities.base64Decode(improvedMp3B64), 'audio/mp3', 'audio_entrevista_mejorada.mp3')
    );
  }

  if (feedbackMp3B64) {
    attachments.push(
      Utilities.newBlob(Utilities.base64Decode(feedbackMp3B64), 'audio/mp3', 'audio_feedback.mp3')
    );
  }

  MailApp.sendEmail({
    to:      emailDest,
    subject: 'Entrevista de Trabajo – MP3 (original + entrevista mejorada + feedback)',
    body:    'Adjunto: audio original, entrevista mejorada (con lenguaje no verbal integrado) y el feedback.',
    attachments
  });
}

/**
 * Genera PDF (base64) con:
 * - Discurso original
 * - Entrevista mejorada (mismas preguntas + respuestas mejoradas)
 * - Feedback (verbal + no verbal)
 * - Resumen no verbal (módulo automático)
 */
function generatePdfBase64(payload) {
  // payload = { institucion, original, improvedInterview, feedback, nonVerbal }
  const doc = DocumentApp.create('Entrevista de Trabajo – Exporte PDF');
  const body = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(36).setMarginRight(36);
  const h  = (t)=> body.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const h2 = (t)=> body.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const p  = (t)=> body.appendParagraph(t);

  h('Entrevista de Trabajo – Informe Verbal + No Verbal');
  p('Institución: ' + (payload.institucion || '-'));
  p('Fecha: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  body.appendParagraph(''); // espacio

  h2('Discurso original (verbal)');
  p(payload.original || '(vacío)');
  body.appendParagraph('');

  h2('Entrevista mejorada (preguntas + respuestas)');
  p(payload.improvedInterview || '(vacío)');
  body.appendParagraph('');

  h2('Feedback integrado (verbal + no verbal)');
  p(payload.feedback || '(vacío)');
  body.appendParagraph('');

  h2('Resumen no verbal (módulo automático)');
  p(payload.nonVerbal || '(vacío)');

  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  const pdfBlob = file.getAs('application/pdf').setName('Entrevista_Trabajo_Integrada.pdf');
  // Limpieza: enviar PDF y mandar el Doc a la papelera
  file.setTrashed(true);

  return Utilities.base64Encode(pdfBlob.getBytes());
}

/**
 * ANALISIS NO VERBAL – Vision API
 * Recibe una imagen en base64 (sin prefijo dataURL),
 * llama a Cloud Vision FACE_DETECTION
 * y devuelve un resumen de cara (las manos las calcula MediaPipe en el cliente).
 */
function analyzeImage(imageBase64) {
  const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + VISION_API_KEY;

  const payload = {
    requests: [{
      image: { content: imageBase64 },
      features: [
        { type: 'FACE_DETECTION', maxResults: 1 }
        // OBJECT_LOCALIZATION se deja de usar para manos (lo hace MediaPipe en el cliente)
      ]
    }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(res.getContentText());

  const response = (data.responses && data.responses[0]) || {};
  const face = (response.faceAnnotations && response.faceAnnotations[0]) || null;

  // Si no hay cara, devolvemos solo info mínima
  if (!face) {
    return {
      faceDetected: false
    };
  }

  // ---------- Caja normalizada del rostro ----------
  let faceCenterX = null;
  let faceCenterY = null;
  let faceBox = null;

  const facePoly = face.boundingPoly || face.fdBoundingPoly;
  if (facePoly) {
    faceBox = getNormalizedBox(facePoly);
    if (faceBox) {
      faceCenterX = faceBox.cx;
      faceCenterY = faceBox.cy;
    }
  }

  // OJO: las manos ya NO se calculan aquí; se harán con MediaPipe en el cliente.
  // Para mantener compatibilidad, devolvemos valores neutros que luego se sobrescribirán.
  const handCount = 0;
  const handAreaNorm = 0;
  const handNearFace = false;
  const handCoverFace = false;

  return {
    faceDetected: true,
    joy: face.joyLikelihood,
    anger: face.angerLikelihood,
    surprise: face.surpriseLikelihood,
    panAngle: face.panAngle,
    tiltAngle: face.tiltAngle,
    rollAngle: face.rollAngle,
    centerX: faceCenterX,
    centerY: faceCenterY,
    // NUEVO: devolvemos tamaño y caja de la cara para que el cliente pueda saber si las manos la tapan
    faceW: faceBox ? faceBox.w : null,
    faceH: faceBox ? faceBox.h : null,
    faceBox,
    // estos campos se sobrescriben en el cliente con datos de MediaPipe
    handCount: handCount,
    handAreaNorm: handAreaNorm,
    handNearFace: handNearFace,
    handCoverFace: handCoverFace
  };
}

/**
 * A partir de un boundingPoly con normalizedVertices (0–1),
 * devuelve centro (cx,cy), ancho/alto (w,h) normalizados y extremos.
 */
function getNormalizedBox(poly) {
  if (!poly) return null;

  const nvs = poly.normalizedVertices;
  if (nvs && nvs.length > 0) {
    const xs = nvs.map(v => v.x || 0);
    const ys = nvs.map(v => v.y || 0);
    const minX = Math.min.apply(null, xs);
    const maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxY = Math.max.apply(null, ys);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = maxX - minX;
    const h = maxY - minY;

    return { cx: cx, cy: cy, w: w, h: h, x0: minX, y0: minY, x1: maxX, y1: maxY };
  }

  return null;
}
