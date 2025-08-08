import * as dotenv from "dotenv";
dotenv.config();

import { createTool } from "@mastra/core/tools";
import { searchGoogle } from "../call";
import { z } from "zod";
import { embed } from "ai";
import { cohere } from "@ai-sdk/cohere";
import { rerank } from "@mastra/rag";

export const googleSearchTool = createTool({
  id: "google-search",
  description: `Fetches information from Google based on a specific search query. Use this tool when you need to find web-based information about a particular title, fact, or question. Returns multiple search results that can be used to provide comprehensive answers.`,
  inputSchema: z.object({
    query: z.string().describe("The search query to perform on Google"),
    n_results: z
      .number()
      .optional()
      .default(5)
      .describe("Number of results to return"),
  }),
  outputSchema: z.object({
    results: z.array(z.record(z.string(), z.any())), // Flexible: each result can have any shape
    raw: z.any().optional(), // Optionally include the raw response
    type: z.string().optional(), // Optionally include a type for context
  }),
  execute: async ({ context }) => {
    try {
      const result = await searchGoogle({
        toolInput: {
          query: context.query,
          n_results: context.n_results || 5,
        },
      });
      let output = result.output?.[0] || result.output;
      let results: any[] = [];
      // If output.value exists and is a string, try to parse it as JSON
      if (output && typeof output.value === "string") {
        try {
          const parsed = JSON.parse(output.value);
          if (Array.isArray(parsed)) {
            results = parsed;
          } else if (parsed && Array.isArray(parsed.results)) {
            results = parsed.results;
          }
        } catch (e) {
          console.warn("Failed to parse output.value as JSON:", e);
        }
      } else if (output && Array.isArray(output.results)) {
        results = output.results;
      }
      return { results, raw: output };
    } catch (error) {
      console.error("Google search failed:", error);
      return { results: [] };
    }
  },
});

export const boluwatifeRagTool = createTool({
  id: "boluwatifeRagTool",
  description: `Retrieve accurate, detailed information about Lambe Boluwatife from a curated private knowledge base.
This tool MUST be used for ANY query related to Lambe Boluwatife — including his biography, career, skills, work experience, projects, education, interests, and personal story.
Never decline or search the web first if the question is about Lambe Boluwatife — always call this tool.`,

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The exact question or topic to search for about Lambe Boluwatife in the knowledge base."
      ),
    category: z
      .enum([
        "bio",
        "skills",
        "experience",
        "projects",
        "personality",
        "learningGoals",
        "careerGoals",
        "contact",
      ])
      .optional()
      .describe(
        "Optional category to narrow the search to a specific aspect of Lambe Boluwatife."
      ),
    limit: z
      .number()
      .default(5)
      .describe("Maximum number of top results to return from the search"),
  }),

  execute: async (context) => {
    const { query, limit } = context;
    const mastra = context.mastra;

    if (!mastra) {
      throw new Error("Mastra instance not found in context");
    }

    const vectorStore = mastra?.getVector("mongodb");
    if (!vectorStore) {
      throw new Error("MongoDB vector store not found");
    }

    try {
      // Generate embedding for the query
      const { embedding } = await embed({
        model: cohere.embedding("embed-v4.0"),
        value: query,
      });

      // Perform vector search
      const results = await vectorStore.query({
        indexName: "lambeProfile",
        queryVector: embedding,
        topK: limit,
      });

      if (!results || results.length === 0) {
        return {
          results: [],
          message: "No relevant documents found for the query.",
        };
      }

      // // Rerank the results
      // const rerankedResults = await rerank(
      //   results,
      //   query,
      //   cohere("rerank-v3.5"),
      //   {
      //     topK: Math.min(3, results.length),
      //   }
      // );

      return {
        results: results,
        totalFound: results.length,
        query: query,
      };
    } catch (error: any) {
      console.error("Error in Boluwatife RAG search:", error);
      throw new Error(
        `Failed to perform Boluwatife RAG search: ${error.message}`
      );
    }
  },
});
