import OpenAI from "openai";

let client;

const getClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return client;
};

export const getEmbedding = async (text) => {
  const openaiClient = getClient();
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const response = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0]?.embedding ?? [];
};
