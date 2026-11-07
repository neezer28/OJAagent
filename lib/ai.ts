import OpenAI from "openai";

export const ai = new OpenAI({
  baseURL: "https://cloud-api.near.ai/v1",
  apiKey: process.env.NEAR_AI_API_KEY!,
});

export const MODEL = process.env.NEAR_AI_MODEL!;