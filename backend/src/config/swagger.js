import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AI Image Retrieval API",
      version: "1.0.0",
      description: "Upload image, metadata search, and AI embedding search APIs.",
    },
    servers: [
      {
        url: "http://localhost:5000",
      },
    ],
    components: {
      schemas: {
        Image: {
          type: "object",
          properties: {
            _id: { type: "string" },
            url: { type: "string" },
            description: { type: "string" },
            apartmentCode: { type: "string" },
            saleName: { type: "string" },
            apartmentType: { type: "string" },
            apartmentCondition: { type: "string" },
            price: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            embedding: {
              type: "array",
              items: { type: "number" },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};
