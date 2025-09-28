/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, Type} from '@google/genai';
import {marked} from 'marked';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

const fileInput = document.querySelector('#file-input') as HTMLInputElement;
const fileNameDisplay = document.querySelector('#file-name') as HTMLSpanElement;
const statusDisplay = document.querySelector('#status') as HTMLDivElement;
const slideshow = document.querySelector('#slideshow') as HTMLDivElement;
const errorDisplay = document.querySelector('#error') as HTMLDivElement;
const linkedinSuggestions = document.querySelector('#linkedin-suggestions') as HTMLDivElement;
const linkedinText = document.querySelector('#linkedin-text') as HTMLParagraphElement;
const linkedinHashtags = document.querySelector('#linkedin-hashtags') as HTMLParagraphElement;
const copyTextBtn = document.querySelector('#copy-text') as HTMLButtonElement;
const copyHashtagsBtn = document.querySelector('#copy-hashtags') as HTMLButtonElement;
const publishDraftBtn = document.querySelector('#publish-draft') as HTMLButtonElement;
const optionalPromptInput = document.querySelector('#optional-prompt') as HTMLTextAreaElement;
const numSlidesInput = document.querySelector('#num-slides') as HTMLInputElement;
const downloadAllBtn = document.querySelector('#download-all') as HTMLButtonElement;

let generatedImages: { name: string, data: string }[] = [];

function getStorySystemInstruction(count: number, prompt: string): string {
  const baseInstruction = `
Eres un experto en comunicación que explica temas complejos de forma sencilla y divertida.
Tu tarea es tomar el siguiente texto y convertirlo en un guion para una presentación de exactamente ${count} diapositivas.
Usa una metáfora de una historia con muchos gatitos pequeños y adorables.
Cada diapositiva debe tener una sola frase. Las frases deben ser cortas, conversacionales, casuales y atractivas.
Para cada frase, crea un 'image_prompt' que describa una ilustración linda y minimalista con tinta negra sobre fondo blanco para acompañarla.
No agregues comentarios, solo comienza la explicación.
El resultado debe ser un objeto JSON.`;

  if (prompt) {
    return `${baseInstruction}\n\nIMPORTANTE: El usuario ha proporcionado una guía adicional. Basa la historia y las imágenes en la siguiente idea: "${prompt}"`;
  }
  return baseInstruction;
}


const linkedinSystemInstruction = `
Eres un experto en redes sociales especializado en LinkedIn.
Basado en el siguiente texto, tu tarea es crear una publicación para LinkedIn y una lista de hashtags relevantes.
El texto de la publicación debe ser profesional, atractivo y no debe sonar como 'clickbait'. Debe resumir la idea principal del texto de una manera que genere interés y conversación.
Los hashtags deben ser relevantes para el tema y populares en LinkedIn.
El resultado debe ser un objeto JSON.`;

async function addSlide(text: string, imageSrc: string, slideIndex: number) {
  const slide = document.createElement('div');
  slide.className = 'slide';

  const caption = document.createElement('div');
  caption.className = 'slide-caption';
  caption.innerHTML = await marked.parse(text);

  const img = document.createElement('img');
  img.src = imageSrc;

  const downloadLink = document.createElement('a');
  downloadLink.href = imageSrc;
  downloadLink.download = `gatito-slide-${slideIndex + 1}.jpeg`;
  downloadLink.className = 'download-link';
  downloadLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  downloadLink.ariaLabel = 'Descargar imagen';
  
  if (imageSrc.startsWith('data:image/svg+xml')) {
    downloadLink.style.display = 'none';
  } else {
    generatedImages.push({
        name: `gatito-slide-${slideIndex + 1}.jpeg`,
        data: imageSrc.split(',')[1]
    });
  }

  slide.append(img);
  slide.append(caption);
  slide.append(downloadLink);
  slideshow.append(slide);
}

function updateStatus(message: string) {
  statusDisplay.textContent = message;
}

function showError(message: string) {
  errorDisplay.textContent = message;
  errorDisplay.removeAttribute('hidden');
}

function clearUI() {
  slideshow.innerHTML = '';
  slideshow.setAttribute('hidden', 'true');
  errorDisplay.innerHTML = '';
  errorDisplay.setAttribute('hidden', 'true');
  linkedinSuggestions.setAttribute('hidden', 'true');
  downloadAllBtn.setAttribute('hidden', 'true');
  statusDisplay.textContent = '';
  generatedImages = [];
}

async function extractTextFromPDF(file: File): Promise<string> {
  const fileReader = new FileReader();
  return new Promise((resolve, reject) => {
    fileReader.onload = async (event) => {
      try {
        const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(' ');
        }
        resolve(text);
      } catch (e) {
        reject(e);
      }
    };
    fileReader.onerror = reject;
    fileReader.readAsArrayBuffer(file);
  });
}

function createPlaceholderImage(text: string): string {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320" style="background-color:#f0f0f0; border-radius: 6px;">
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="'Space Mono', monospace" font-size="16px" fill="#6c757d">
          ${text}
      </text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}


async function generate(file: File) {
  fileInput.disabled = true;
  clearUI();

  try {
    const optionalPrompt = optionalPromptInput.value.trim();
    const numSlides = parseInt(numSlidesInput.value, 10);

    updateStatus('Analizando el PDF... 📄');
    if (file.type !== 'application/pdf') {
       showError('Por favor, sube un archivo PDF. El soporte para PPTX llegará pronto.');
       fileInput.disabled = false;
       return;
    }
    const documentText = await extractTextFromPDF(file);

    updateStatus('Escribiendo el guion con gatitos... 🐈');
    const storyInstruction = getStorySystemInstruction(numSlides, optionalPrompt);
    const scriptResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{role: 'user', parts: [{text: documentText}]}],
      config: {
        systemInstruction: storyInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sentence: {type: Type.STRING},
              image_prompt: {type: Type.STRING},
            },
          },
        },
      },
    });

    const slideData = JSON.parse(scriptResponse.text);
    slideshow.removeAttribute('hidden');

    for (const [index, data] of slideData.entries()) {
      updateStatus(`Dibujando el gatito ${index + 1} de ${slideData.length}... 🎨`);
      let imageSrc: string;
      try {
        const imageResponse = await ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: `${data.image_prompt}, cute minimal illustration, black ink on white background`,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
          },
        });

        if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0 && imageResponse.generatedImages[0].image) {
            imageSrc = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
        } else {
            console.warn(`No se pudo generar la imagen para la diapositiva ${index + 1}. Motivo: Respuesta vacía de la API.`, imageResponse);
            imageSrc = createPlaceholderImage('Gatito no disponible :(');
        }
      } catch (imgError) {
          console.error(`Error generando la imagen para la diapositiva ${index + 1}:`, imgError);
          imageSrc = createPlaceholderImage('Error al dibujar gatito');
      }
      await addSlide(data.sentence, imageSrc, index);
    }

    updateStatus('Preparando sugerencias para LinkedIn... 👔');
    const linkedinResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{role: 'user', parts: [{text: documentText}]}],
        config: {
            systemInstruction: linkedinSystemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    post: {type: Type.STRING},
                    hashtags: {type: Type.ARRAY, items: {type: Type.STRING}}
                }
            }
        }
    });

    const linkedinData = JSON.parse(linkedinResponse.text);
    linkedinText.textContent = linkedinData.post;
    linkedinHashtags.textContent = linkedinData.hashtags.join(' ');
    linkedinSuggestions.removeAttribute('hidden');

    if (generatedImages.length > 0) {
        downloadAllBtn.removeAttribute('hidden');
    }

    updateStatus('¡Tu presentación está lista! 🎉');

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'Error desconocido';
    showError(`Algo salió mal: ${errorMessage}`);
    updateStatus('Error al generar el contenido.');
  } finally {
    fileInput.disabled = false;
  }
}

async function downloadAllImages() {
    if (generatedImages.length === 0) return;
    
    updateStatus('Comprimiendo gatitos... 📦');
    const zip = new JSZip();
    for (const image of generatedImages) {
        zip.file(image.name, image.data, { base64: true });
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = 'todos-los-gatitos.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    updateStatus('¡Tu presentación está lista! 🎉');
}


fileInput.addEventListener('change', async () => {
  if (fileInput.files && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    fileNameDisplay.textContent = file.name;
    await generate(file);
  } else {
    fileNameDisplay.textContent = 'Ningún archivo seleccionado';
  }
});


function copyToClipboard(text: string, button: HTMLButtonElement) {
    navigator.clipboard.writeText(text).then(() => {
        const originalContent = button.innerHTML;
        button.innerHTML = '✓';
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.classList.remove('copied');
        }, 2000);
    });
}

copyTextBtn.addEventListener('click', () => {
    const text = linkedinText.textContent || '';
    copyToClipboard(text, copyTextBtn);
});

copyHashtagsBtn.addEventListener('click', () => {
    const hashtags = linkedinHashtags.textContent || '';
    copyToClipboard(hashtags, copyHashtagsBtn);
});

publishDraftBtn.addEventListener('click', () => {
  alert('Próximamente: ¡Esta función publicará directamente en LinkedIn!');
});

downloadAllBtn.addEventListener('click', downloadAllImages);
