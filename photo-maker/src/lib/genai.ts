import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "cole_sua_chave_aqui") {
  console.warn("⚠️  GEMINI_API_KEY não configurada em .env.local");
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

export async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    data: buffer.toString("base64"),
    mimeType: file.type || "image/jpeg",
  };
}
