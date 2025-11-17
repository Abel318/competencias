/**
 * Elevator Pitch + Lenguaje No Verbal – SAE (SIN API OpenAI, v4.2 manos MediaPipe)
 * - Módulo VERBAL:
 *    · Un prompt integrado → informe (PITCH 30s + PITCH 60s + feedback… pegado manual)
 *    · Conversión del audio original a MP3 en el cliente (lamejs)
 *    · TTS del pitch elegido (30s/60s) y del feedback (Google Cloud TTS)
 *    · PDF export (Google Docs → PDF → base64 al cliente)
 *    · Email con tres MP3: original + mejorado (30s/60s) + feedback
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
    .setTitle('Elevator Pitch – Verbal + No Verbal (SAE)')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
 *   Original, 30s, 60s, Feedback (verbal + no verbal integrado),
 *   Secuencia completa (incluye resumen no verbal al final).
 */
function saveEntry(institucion, original, pitch30, pitch60, feedbackText, fullSeq) {
  const sheetId = '1dJWhH43AhlU2ZOH7o0A5WVBXh5Z9nXw9ZmpDi23EHso'; // ajusta si procede
  const sheet   = SpreadsheetApp.openById(sheetId).getActiveSheet();
  const now     = new Date();
  const tz      = Session.getScriptTimeZone();

  sheet.appendRow([
    Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    Utilities.formatDate(now, tz, 'HH:mm:ss'),
    institucion,
    original,
    pitch30,
    pitch60,
    feedbackText || '',
    fullSeq
  ]);
}

/** Email con 3 MP3: original + mejorado (30s/60s) + feedback */
function sendAudioByEmail(emailDest, originalMp3B64, improvedMp3B64, improvedLabel, feedbackMp3B64) {
  if (!emailDest) throw new Error('Email destinatario no proporcionado.');

  const attachments = [];

  if (originalMp3B64) {
    attachments.push(
      Utilities.newBlob(Utilities.base64Decode(originalMp3B64), 'audio/mp3', 'audio_original.mp3')
    );
  }

  if (improvedMp3B64) {
    const fname = improvedLabel === '60s' ? 'audio_mejorado_60s.mp3' : 'audio_mejorado_30s.mp3';
    attachments.push(
      Utilities.newBlob(Utilities.base64Decode(improvedMp3B64), 'audio/mp3', fname)
    );
  }

  if (feedbackMp3B64) {
    attachments.push(
      Utilities.newBlob(Utilities.base64Decode(feedbackMp3B64), 'audio/mp3', 'audio_feedback.mp3')
    );
  }

  MailApp.sendEmail({
    to:      emailDest,
    subject: 'Elevator Pitch – MP3 (original + mejorado + feedback)',
    body:    'Adjunto: audio original, pitch mejorado (' + (improvedLabel || '30s') + ') y el feedback (incluido no verbal).',
    attachments
  });
}

/**
 * Genera PDF (base64) con:
 * - Discurso original
 * - Pitch 30s
 * - Pitch 60s
 * - Feedback (verbal + no verbal)
 * - Resumen no verbal (módulo automático)
 */
function generatePdfBase64(payload) {
  // payload = { institucion, original, pitch30, pitch60, feedback, nonVerbal }
  const doc = DocumentApp.create('Elevator Pitch – Exporte PDF');
  const body = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(36).setMarginRight(36);
  const h  = (t)=> body.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const h2 = (t)=> body.appendParagraph(t).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const p  = (t)=> body.appendParagraph(t);

  h('Elevator Pitch – Informe Verbal + No Verbal');
  p('Institución: ' + (payload.institucion || '-'));
  p('Fecha: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  body.appendParagraph(''); // espacio

  h2('Discurso original (verbal)');
  p(payload.original || '(vacío)');
  body.appendParagraph('');

  h2('Pitch 30s (versión mejorada)');
  p(payload.pitch30 || '(vacío)');
  body.appendParagraph('');

  h2('Pitch 60s (versión mejorada)');
  p(payload.pitch60 || '(vacío)');
  body.appendParagraph('');

  h2('Feedback integrado (verbal + no verbal)');
  p(payload.feedback || '(vacío)');
  body.appendParagraph('');

  h2('Resumen no verbal (módulo automático)');
  p(payload.nonVerbal || '(vacío)');

  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  const pdfBlob = file.getAs('application/pdf').setName('Elevator_Pitch_Integrado.pdf');
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
