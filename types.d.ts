declare module '@google/genai' {
  export class GoogleGenAI {
    constructor(config: { apiKey: string });
    models: {
      generateContent: (params: any) => Promise<any>;
      generateImages: (params: any) => Promise<any>;
    };
  }
  
  export enum Type {
    ARRAY = 'array',
    OBJECT = 'object',
    STRING = 'string',
  }
}

declare module 'marked' {
  export function marked(): any;
  export namespace marked {
    function parse(text: string): Promise<string>;
  }
}

declare module 'pdfjs-dist/build/pdf.mjs' {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };
  
  export function getDocument(data: any): {
    promise: Promise<any>;
  };
}

declare module 'jszip' {
  export default class JSZip {
    file(name: string, data: string, options?: { base64?: boolean }): void;
    generateAsync(options: { type: string }): Promise<Blob>;
  }
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
      GEMINI_API_KEY: string;
    }
  }
} 