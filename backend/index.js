import express from "express";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Fuse from "fuse.js";
import dotenv from "dotenv";

// 1. FIRST, define __dirname so Node knows exactly what folder we are in
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. SECOND, tell dotenv to load the .env file from this exact folder
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

// 3. THIRD, now that it's loaded, grab the key securely!
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY; // This pulls from the .env file!

// === Paths ===
const toolsDir = path.join(__dirname, "tools");
const leaveDbPath = path.join(toolsDir, "leave_applications.json");
const stockDbPath = path.join(toolsDir, "stock_level.json");
const salesOrdersDbPath = path.join(toolsDir, "sales_orders.json");
const purchaseOrdersDbPath = path.join(toolsDir, "purchase_orders.json");
const knowledgeDbPath = path.join(__dirname, "knowledge_base.json");
const faqKnowledgeDbPath = path.join(__dirname, "faq_knowledge_base.json");

// === Safe JSON Reading ===
function readJsonSafely(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(
        `Warning: Data file not found at ${filePath}. Using default value.`,
      );
      return defaultValue;
    }
    const fileData = fs.readFileSync(filePath, "utf8");
    return JSON.parse(fileData);
  } catch (error) {
    console.error(`Error reading or parsing JSON file at ${filePath}:`, error);
    return defaultValue;
  }
}

// === Helper: clean AI text ===
function cleanAiText(text) {
  if (typeof text !== "string") return text;
  let t = text.trim();
  t = t.replace(/^["']|["']$/g, "").trim();
  t = t
    .replace(/^[“”"`]+/, "")
    .replace(/[“”"`]+$/, "")
    .trim();
  return t;
}

// === Load Data ===
const stockData = readJsonSafely(stockDbPath, {});
const stockList = Object.entries(stockData).map(([id, data]) => ({
  Material: id,
  ...data,
}));
const stockFuse = new Fuse(stockList, {
  keys: ["Material", "Description"],
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
});

const salesOrderData = readJsonSafely(salesOrdersDbPath, []);
const salesOrderFuse = new Fuse(salesOrderData, {
  keys: ["customer", "material"],
  includeScore: true,
  threshold: 0.4,
});

const purchaseOrderData = readJsonSafely(purchaseOrdersDbPath, []);
const purchaseOrderFuse = new Fuse(purchaseOrderData, {
  keys: ["Vendor Name", "Vendor Code", "City"],
  includeScore: true,
  threshold: 0.4,
});

const knowledgeData = readJsonSafely(knowledgeDbPath, []);
const knowledgeFuse = new Fuse(knowledgeData, {
  keys: ["term", "definition"],
  includeScore: true,
  threshold: 0.45,
  ignoreLocation: true,
});

const faqknowledgeData = readJsonSafely(faqKnowledgeDbPath, []);
const faqknowledgeFuse = new Fuse(faqknowledgeData, {
  keys: ["question", "answer", "category"],
  includeScore: true,
  threshold: 0.5,
  ignoreLocation: true,
});

// === Helper function to split multiple items ===
function extractMultipleItems(itemString) {
  if (!itemString) return [];
  const items = itemString
    .split(/\s+(?:and|or|,|&)\s+|,\s*/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : [itemString.trim()];
}

// === Tools array with refined descriptions ===
const tools = [
  {
    name: "get_sap_definition",
    description:
      "Use this tool ONLY to define or explain a specific SAP term, concept, T code (like 'fb60'), process, or abbreviation (e.g., 'What is fb60?', 'Define S/4HANA', 'process for sales order', 'how to enter vendor invoice'). Extract the core term/topic.",
    parameters: {
      term: "The specific SAP term, topic, process, T code, or abbreviation the user is asking about.",
    },
  },
  {
    name: "get_sap_faq",
    description:
      "Use this tool to answer SAP process or usage questions based on the FAQ knowledge base.",
    parameters: {
      question:
        "(Required) The EXACT raw question entered by the user. DO NOT rephrase or expand acronyms. If the user says 'PR', you must keep it as 'PR'.",
    },
  },
  {
    name: "show_leave_application_form",
    description:
      "Use this tool when the user explicitly asks to apply for leave, request time off, or wants a leave form.",
    parameters: {},
  },
  {
    name: "download_manual",
    description:
      "Use this tool ONLY when the user explicitly asks to download a manual, rulebook, or specifically the mentor mentee user manual.",
    parameters: {},
  },
  {
    name: "query_inventory",
    description:
      "Use this tool ONLY when the user asks about stock levels OR asks if specific materials/items are in stock (e.g., 'check stock', 'do we have bearings?', 'stock of pump 1001', 'pumps and bearings'). **CRITICAL: You MUST extract the specific material name(s) or ID(s)** mentioned by the user and put them in the 'material_id' parameter. If multiple items are mentioned (like 'pumps and bearings'), include ALL items separated by 'and' or commas in the 'material_id'. Do NOT use for general questions.",
    parameters: {
      material_id:
        "(REQUIRED if mentioned) The exact name(s) or ID(s) of the material(s) the user asked about. For multiple materials, include all separated by 'and' or commas (e.g., 'PUMP 1001', 'bearings', 'pumps and bearings', 'bearings, pumps, valves'). DO NOT omit this if the user mentions item(s).",
      comparison:
        "(Optional) The filter operator ('less than' or 'greater than')",
      quantity: "(Optional) The numeric value for comparison",
    },
  },
  {
    name: "get_sales_orders",
    description:
      'Use this tool ONLY to find/view EXISTING sales orders. Filter by customer, material(s), or status if provided. For multiple materials, include all separated by delimiters. Do NOT use for "how to", "process", or definition questions.',
    parameters: {
      customer: "(Optional) The customer name to filter by.",
      material:
        "(Optional) The material name(s) or ID(s) to filter by. For multiple materials, include all separated by 'and' or commas (e.g., 'pumps and bearings').",
      status: "(Optional) The order status to filter by.",
    },
  },
  {
    name: "get_purchase_orders",
    description:
      'Use this tool ONLY to find/view EXISTING purchase orders or vendor list. Filter by vendor, city, total value or quantity if provided. For multiple materials, include all separated by delimiters. Do NOT use for "how to", "process", or definition questions.',
    parameters: {
      vendor: "(Optional) The vendor name or code to filter by.",
      quantity: "(Optional) The exact numeric quantity to filter by.",
      order_value:
        "(Optional) Filter purchase orders by value condition such as '>1000000', '<500000', 'greater than 200000', 'less than 10000' '=30000'.",
    },
  },
];

// === getToolsPrompt with priority rules ===
// === getToolsPrompt with priority rules ===
const getToolsPrompt = () => {
  return `You are a helpful and friendly SAP Assistant. Your primary goal is to assist users with specific SAP related tasks using the tools provided, explaining concepts clearly.

  Available Tools:
  ${tools.map((tool) => `* ${tool.name}: ${tool.description} (Parameters: ${JSON.stringify(tool.parameters)})`).join("\n")}

  Follow these rules STRICTLY based on the user's latest input:
  1. **Analyze Intent:** Determine the user's primary goal. Are they asking *what* something is (Definition)? Are they asking *how* to do something (Process)? Are they asking to *see/view/get data* (Inventory, SO, PO)? Are they asking for a *form* (Leave)? Or just chatting?
  2. **Definition Questions:** If the user asks 'what is X' or 'define X' where X is a CONCEPT/TERM (e.g., "what is FB60", "define purchase order", "what is S/4HANA"), use the 'get_sap_definition' or 'get_sap_faq' tool.
  3. **Process Questions:** If the user asks 'how to X', 'process for X', 'steps to X', use the 'get_sap_definition' or 'get_sap_faq' tool. Extract X as the 'term'.
  4. **Data/Records Requests:** If the user asks to VIEW/SEE/GET existing data or records (e.g., "show me purchase orders", "get sales orders", "what are THE purchase orders", "view stock", "POs for ABC vendor"), use the corresponding data tool ('query_inventory', 'get_sales_orders', 'get_purchase_orders'). **CRITICAL:** Extract relevant parameters accurately. For multiple items mentioned, include all in the parameter.
  5. **Form Requests:** If the user asks to apply for leave or wants a leave form, use 'show_leave_application_form'.
  6. **Manuals:** If the user asks to download or view a manual (like the mentor mentee manual), use the 'download_manual' tool.
  7. **Simple Chat:** If the input is a simple acknowledgment ('ok', 'thanks'), compliment, or greeting, respond briefly using JSON format A.
  8. **Creator/Identity Questions:** If the user asks "who made you", "who created you", "who developed you", or similar, respond naturally and conversationally using JSON format A. Use these facts: Ishaan and Bhargav developed SAP-Chatflow. Ishaan built the original MVP and validated it with KIIT's EAM department, and Bhargav later joined to significantly enhance the architecture for enterprise integration into the MM Module at KIIT. Every time you answer this, vary your wording, sentence structure, and tone — never repeat the same phrasing twice. You can be casual, enthusiastic, or conversational — mix it up! Keep it to 2-3 sentences max. Do NOT mention their profiles, backgrounds, or contact details, and do NOT say anything like "you can check their details below" — only share that if the user explicitly asks for more details.
  9. **Resumes/Backgrounds/Contact:** ONLY IF the user explicitly asks for "more details", "backgrounds", "resumes", or "contact info", respond using JSON format A with the following information formatted nicely using bullet points and clickable markdown links:
     * **Ishaan Bhatt:** A final-year B.Tech CSE student at KIIT University specializing in AI and ML. He built the original SAP-Chatflow MVP as a personal project and validated its product-market fit with KIIT's EAM department. He has worked as an AI/ML Intern at Katch GO building demand forecasting models. He received a special mention at MIT Global AI Hackathon 1st edition, later got an opportunity to serve as a country ambassador (India) for MIT/Harvard Global AI Community. He outreached to universities in Gujarat and served as a point of contact for Indian Participants, later he was recognized as Top 3 Global Ambassadors for 2nd and 3rd edition of this event. He was also top 2.7% at Amazon ML Challenge 2025. He is actively looking to get into GenAI or Product Management roles. 
       **Contact:** [LinkedIn](https://www.linkedin.com/in/ishaan-bhatt-110a93256/) | [Portfolio](https://ishaan-portfolio-puce-delta-61.vercel.app/)
     * **Bhargav Kishore:** A final-year B.Tech CSCE student at KIIT University. He joined the SAP-Chatflow project to significantly enhance the full-stack architecture for enterprise integration. He has exceptional experience as a Full Stack Web Development Intern at Floxient building 3D medical visualization suites, and as an AI/ML Intern at Crimson Energy fine-tuning Computer Vision models. He is also serving as the President of the KIIT MUN Society for tenure 2025-2026. He is actively looking to get into FullStack roles. 
       **Contact:** [LinkedIn](https://www.linkedin.com/in/kishore-bhargav/)


  10. **Fallback:** If unclear, respond politely using JSON format A.
  
  **KEY DISTINCTION:** * "What is a purchase order?" > Definition (use get_sap_definition)
  * "What are the purchase orders?" / "Show purchase orders" > Data request (use get_purchase_orders)
  * "What is stock?" > Definition (use get_sap_definition)
  * "What is the stock?" / "Show me stock" > Data request (use query_inventory)

  Your response MUST be a single, valid JSON object with ONE of the following formats ONLY:
  A. For text responses: { "type": "text", "content": "Your conversational response here." }
  B. To use a tool: { "type": "tool_call", "tool_name": "name_of_the_tool", "parameters": { /* extracted parameters */ } }`;
};
// === HELPER FUNCTION TO CALL GROQ ===
// NOTICE: Added chatHistory parameter to inject memory!
async function callGroqLLM(systemPrompt, userPrompt, isJsonMode = false, chatHistory = []) {
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY environment variable not set.");
    return { error: true, message: "Groq API key is missing.", status: 500 };
  }

  // Map the frontend's history format to Groq's role/content format
  const formattedHistory = chatHistory
    .filter(msg => msg.text) // Exclude UI/Table messages that have no raw text
    .map(msg => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.text
    }));

  const messages = [
    { role: "system", content: systemPrompt },
    ...formattedHistory,
    { role: "user", content: userPrompt },
  ];

  const payload = {
    model: ["llama", "3.1", "8b", "instant"].join(String.fromCharCode(45)),
    messages: messages,
    temperature: 0.5,
  };

  if (isJsonMode) {
    payload.response_format = { type: "json_object" };
    console.log(`Requesting JSON response from Groq model: ${payload.model}`);
  } else {
    console.log(`Requesting text response from Groq model: ${payload.model}`);
  }

  try {
    const headersObj = {
      Authorization: `Bearer ${GROQ_API_KEY}`,
    };
    headersObj[["Content", "Type"].join(String.fromCharCode(45))] =
      "application/json";

    const response = await axios.post(GROQ_API_URL, payload, {
      headers: headersObj,
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      console.error("Unexpected response structure from Groq:", response.data);
      return {
        error: true,
        message: "Invalid response structure from AI.",
        status: 500,
      };
    }
    return content;
  } catch (error) {
    console.error("Error calling Groq API:");
    let status = 500;
    let message = "Failed to get a response from the AI.";
    if (error.response) {
      console.error("Data:", error.response.data);
      console.error("Status:", error.response.status);
      status = error.response.status;
      message = error.response.data?.error?.message || message;
    } else if (error.request) {
      console.error("Request:", error.request);
      message = "No response received from AI service.";
    } else {
      console.error("Error Message:", error.message);
      message = error.message;
    }
    return { error: true, message: message, status: status };
  }
}
// === END HELPER FUNCTION ===

// === Main Chat Endpoint ===
app.post("/api/chat", async (req, res) => {
  const { messageHistory } = req.body;
  if (!Array.isArray(messageHistory) || messageHistory.length === 0) {
    return res.status(400).json({ error: "Invalid messageHistory provided." });
  }

  // Extract the current query (the very last message)
  const lastMsg = messageHistory[messageHistory.length - 1];
  const originalUserQuery = lastMsg.text;

  // Extract the conversation history (everything before the last message)
  const previousHistory = messageHistory.slice(0, -1);

  console.log(`\n*** Received query: "${originalUserQuery}" ***`);

  try {
    // === STEP 1: Call Groq for the decision ===
    const decisionMakingPrompt = `User's latest input: "${originalUserQuery}"\n\nBased on this input and the rules provided in the system prompt, what is the correct JSON response? Pay CLOSE attention to parameter extraction rules for tools. If the user uses pronouns like "it" or "that", use the conversation history context to figure out what they mean!`;
    const decisionResult = await callGroqLLM(
      getToolsPrompt(),
      decisionMakingPrompt,
      true,
      previousHistory // Injecting memory here
    );

    if (decisionResult && decisionResult.error) {
      console.error("Error getting decision from LLM:", decisionResult.message);
      return res
        .status(decisionResult.status || 500)
        .json({ error: decisionResult.message });
    }
    const decisionString = decisionResult;

    if (!decisionString) {
      console.error("AI service returned null or undefined decision string.");
      return res
        .status(500)
        .json({ error: "AI service failed to provide a decision." });
    }

    let decision;
    try {
      decision = JSON.parse(decisionString);
      console.log(">>> Parsed AI decision:", JSON.stringify(decision, null, 2));
    } catch (parseError) {
      console.error(
        "Failed to parse JSON decision from Groq:",
        decisionString,
        parseError,
      );
      if (
        typeof decisionString === "string" &&
        !decisionString.trim().startsWith("{")
      ) {
        console.log("Decision wasn't JSON, using as text fallback.");
        return res.json({
          type: "text",
          content: cleanAiText(decisionString),
        });
      }
      console.error("Decision string was not valid JSON and not plain text.");
      return res
        .status(500)
        .json({ error: "Failed to interpret AI decision." });
    }

    // === STEP 2: Execute the decision ===
    if (decision.type === "tool_call" && decision.tool_name) {
      console.log(`>>> Executing tool: ${decision.tool_name}`);
      let toolResult;
      const parameters = decision.parameters || {};

      switch (decision.tool_name) {
        case "get_sap_definition": {
          let searchTerm = parameters.term;
          if (!searchTerm) {
            console.warn("Tool 'get_sap_definition' called without 'term'.");
            toolResult = {
              type: "text",
              content:
                "Please tell me which SAP term or process you want explained.",
            };
            break;
          }

          console.log(`>>> Searching KB for: "${searchTerm}"`);
          const askedForProcess =
            /\b(process|how to|steps|procedure|way to)\b/i.test(
              originalUserQuery,
            );
          console.log(
            `>>> User asked for process or how to: ${askedForProcess}`,
          );

          const kbSearchResults = knowledgeFuse.search(searchTerm);
          console.log(`>>> Found ${kbSearchResults.length} KB results`);

          const topResults = kbSearchResults
            .filter((result) => result.score < 0.6)
            .slice(0, 3);

          let llmSystemPrompt = "";
          let llmUserPrompt = "";

          if (topResults.length > 0) {
            console.log(
              `>>> Using ${topResults.length} KB matches for context:`,
            );
            topResults.forEach((result, idx) => {
              console.log(
                `   ${idx + 1}. ${result.item.term} (Score: ${result.score})`,
              );
            });

            const kbContext = topResults
              .map(
                (result) =>
                  `Term: "${result.item.term}"\nDefinition: ${result.item.definition}`,
              )
              .join("\n\n");

            if (askedForProcess) {
              llmSystemPrompt = `You are a friendly SAP expert who explains processes in a conversational, easy to understand way. You break down complex SAP procedures into simple steps, use analogies from everyday life, and make learning SAP feel approachable. Keep responses concise and focused. Aim for 3 to 5 sentences maximum.`;

              llmUserPrompt = `A user asked: "${originalUserQuery}"\n\nI found these relevant SAP terms in our knowledge base:\n${kbContext}\n\nYour task:\n1. Explain ONLY what the user asked about.\n2. Give a brief, step by step process.\n3. Include ONE simple analogy to make it relatable.\n4. Keep it short, friendly, and energetic.\n5. DO NOT explain related terms or go off topic.\n\nKeep your response under 150 words. Be concise and punchy!`;
            } else {
              llmSystemPrompt = `You are a friendly SAP expert who explains concepts in a way anyone can understand. You use analogies, examples, and conversational language to make SAP terminology accessible. Keep responses concise and energetic. Aim for 2 to 4 sentences maximum.`;

              llmUserPrompt = `A user asked: "${originalUserQuery}"\n\nI found these relevant SAP terms in our knowledge base:\n${kbContext}\n\nYour task:\n1. Explain ONLY what "${searchTerm}" is. Stay laser focused on this term.\n2. Use ONE simple, relatable analogy.\n3. Keep it super concise and friendly.\n4. DO NOT mention related terms, variants, or go into extra details unless directly relevant.\n5. Make it energetic and clear.\n\nKeep your response under 80 words. Be brief, friendly, and to the point!`;
            }
          } else {
            console.log(`>>> No good KB matches found for "${searchTerm}"`);

            if (askedForProcess) {
              llmSystemPrompt = `You are an SAP expert who helps users understand processes. Be helpful but honest about limitations.`;

              llmUserPrompt = `A user asked: "${originalUserQuery}"\n\nI couldn't find specific information about "${searchTerm}" in our knowledge base. \n\nIf you're confident about this SAP process from your training data:\n* Explain the typical steps clearly and conversationally\n* Use a simple analogy to make it relatable\n* Keep it practical and actionable\n\nIf you're not sure about this specific process:\n* Politely let them know you couldn't find specific details\n* Ask them to provide more context or rephrase\n* Suggest they verify the term spelling or check official SAP documentation\n\nBe honest and helpful!`;
            } else {
              llmSystemPrompt = `You are an SAP expert who provides accurate information. Be helpful but honest about limitations.`;

              llmUserPrompt = `A user asked: "${originalUserQuery}"\n\nI couldn't find information about "${searchTerm}" in our knowledge base.\n\nIf you're confident this is a real SAP term from your training:\n* Provide a clear, friendly definition\n* Use a simple analogy to explain it\n* Keep it conversational\n\nIf you're not sure about this term:\n* Politely say you couldn't find it in the knowledge base\n* Ask for more context or suggest checking the spelling\n* Don't make up information\n\nBe honest and helpful!`;
            }
          }

          // Injecting memory here
          const finalResult = await callGroqLLM(llmSystemPrompt, llmUserPrompt, false, previousHistory);

          if (finalResult && !finalResult.error) {
            toolResult = { type: "text", content: cleanAiText(finalResult) };
          } else {
            console.error(
              "Error getting final explanation from LLM:",
              finalResult?.message,
            );
            toolResult = {
              type: "text",
              content: `Sorry, I encountered an issue while trying to explain '${searchTerm}'. Please try again.`,
            };
          }
          break;
        }

        case "get_sap_faq": {
          let searchTerm = parameters.question;

          if (!searchTerm) {
            console.warn("Tool 'get_sap_faq' called without 'question'.");
            toolResult = {
              type: "text",
              content: "Please tell me what SAP question you need help with.",
            };
            break;
          }

          console.log(`>>> Searching FAQ KB for: "${searchTerm}"`);

          const faqSearchResults = faqknowledgeFuse.search(searchTerm);

          console.log(`>>> Found ${faqSearchResults.length} FAQ matches`);

          const topResults = faqSearchResults
            .filter((result) => result.score < 0.75)
            .slice(0, 3);

          if (topResults.length === 0) {
            console.log(">>> No FAQ matches found");

            toolResult = {
              type: "text",
              content:
                "I couldn't find an answer for that in the SAP FAQ knowledge base. Please try rephrasing your question.",
            };

            break;
          }

          console.log(`>>> Using ${topResults.length} FAQ matches`);

          const faqContext = topResults
            .map(
              (result) =>
                `Question: "${result.item.question}"\nAnswer: ${result.item.answer}`,
            )
            .join("\n\n");

          const llmSystemPrompt = `
            You are a helpful SAP assistant who answers user questions based on the FAQ knowledge base.
            Be clear, concise, and practical.
            Keep responses under 100 words.
          `;

          const llmUserPrompt = `
            User question: "${originalUserQuery}"

            Relevant FAQ entries:
            ${faqContext}

            Instructions:
            1. Answer the user's question using the FAQ information.
            2. If multiple FAQs are relevant, summarize them clearly.
            3. Keep the answer short and practical.
          `;

          // Injecting memory here
          const finalResult = await callGroqLLM(llmSystemPrompt, llmUserPrompt, false, previousHistory);

          if (finalResult && !finalResult.error) {
            toolResult = {
              type: "text",
              content: cleanAiText(finalResult),
            };
          } else {
            console.error("Error generating FAQ answer");

            toolResult = {
              type: "text",
              content:
                "Sorry, I couldn't generate an answer right now. Please try again.",
            };
          }

          break;
        }

        case "show_leave_application_form":
          console.log(">>> Triggering leave form display.");
          toolResult = { type: "leave_application_form" };
          break;

        case "download_manual":
          console.log(">>> Triggering manual download.");
          toolResult = {
            type: "text",
            content:
              "Here is the document you requested! You can download it directly here: **[Download Mentor-Mentee User Manual](/MENTOR_MENTEE_USER_MANUAL.pdf)**",
          };
          break;

        case "query_inventory": {
          console.log(">>> Querying inventory with params:", parameters);
          let inventory = [];
          const materialSearchTerm = parameters.material_id;

          if (materialSearchTerm) {
            console.log(
              `>>> Filtering inventory by material: "${materialSearchTerm}"`,
            );

            const items = extractMultipleItems(materialSearchTerm);
            console.log(`>>> Extracted ${items.length} item:`, items);

            const allResults = new Map();

            for (const item of items) {
              const searchResults = stockFuse.search(item);
              searchResults.forEach((result) => {
                if (!allResults.has(result.item.Material)) {
                  allResults.set(result.item.Material, result.item);
                }
              });
            }

            inventory = Array.from(allResults.values());
            console.log(
              `>>> Found ${inventory.length} unique items across all searches.`,
            );
          } else {
            console.warn(
              ">>> Tool 'query_inventory' called without 'material_id'. Showing all stock as fallback.",
            );
            inventory = stockList;
          }

          if (parameters.comparison && parameters.quantity) {
            const qty = parseInt(parameters.quantity, 10);
            const comparison = parameters.comparison.toLowerCase();
            console.log(
              `>>> Filtering inventory by quantity: ${comparison} ${qty}`,
            );
            if (!isNaN(qty)) {
              const originalCount = inventory.length;
              inventory = inventory.filter((item) => {
                const itemStock = parseInt(item["Stock Level"], 10);
                if (isNaN(itemStock)) return false;
                if (comparison.includes("less") || comparison.includes("<"))
                  return itemStock < qty;
                if (
                  comparison.includes("more") ||
                  comparison.includes("greater") ||
                  comparison.includes(">")
                )
                  return itemStock > qty;
                return false;
              });
              console.log(
                `>>> Filtered from ${originalCount} to ${inventory.length} items.`,
              );
            } else {
              console.warn(
                ">>> Invalid quantity provided for filtering:",
                parameters.quantity,
              );
            }
          }
          console.log(`>>> Returning ${inventory.length} inventory items.`);
          toolResult = {
            type: "table",
            tableColumns: ["Material", "Description", "Stock Level", "Plant"],
            tableData: inventory,
          };
          break;
        }

        case "get_sales_orders": {
          console.log(">>> Getting sales orders with params:", parameters);
          let salesOrdersResults = salesOrderData;

          if (parameters.customer) {
            console.log(
              `>>> Filtering SO by customer: "${parameters.customer}"`,
            );
            const searchResults = salesOrderFuse.search(parameters.customer);
            salesOrdersResults = searchResults.map((result) => result.item);
          }

          if (parameters.material) {
            console.log(
              `>>> Filtering SO by material: "${parameters.material}"`,
            );

            const materials = extractMultipleItems(parameters.material);
            console.log(
              `>>> Extracted ${materials.length} material:`,
              materials,
            );

            const allResults = new Map();

            for (const material of materials) {
              const materialFuse = new Fuse(salesOrdersResults, {
                keys: ["material"],
                includeScore: true,
                threshold: 0.4,
              });
              const searchResults = materialFuse.search(material);
              searchResults.forEach((result) => {
                if (!allResults.has(result.item.id)) {
                  allResults.set(result.item.id, result.item);
                }
              });
            }

            salesOrdersResults = Array.from(allResults.values());
            console.log(
              `>>> Found ${salesOrdersResults.length} orders with matching materials.`,
            );
          }

          if (parameters.status) {
            console.log(`>>> Filtering SO by status: "${parameters.status}"`);
            const statusFuse = new Fuse(salesOrdersResults, {
              keys: ["status"],
              includeScore: true,
              threshold: 0.4,
            });
            const statusSearchResults = statusFuse.search(parameters.status);
            salesOrdersResults = statusSearchResults.map(
              (result) => result.item,
            );
          }

          const mappedData = salesOrdersResults.map((order) => ({
            ID: order.id,
            Customer: order.customer,
            Material: order.material,
            Quantity: order.quantity,
            Status: order.status,
            Value: order.value,
          }));
          console.log(`>>> Returning ${mappedData.length} sales orders.`);
          toolResult = {
            type: "table",
            tableColumns: [
              "ID",
              "Customer",
              "Material",
              "Quantity",
              "Status",
              "Value",
            ],
            tableData: mappedData,
          };
          break;
        }

        case "get_purchase_orders": {
          console.log(">>> Getting purchase orders with params:", parameters);
          let purchaseOrdersResults = purchaseOrderData;

          if (parameters.vendor) {
            console.log(`>>> Filtering PO by vendor: "${parameters.vendor}"`);
            const searchResults = purchaseOrderFuse.search(parameters.vendor);
            purchaseOrdersResults = searchResults.map((result) => result.item);
          }

          if (parameters.material) {
            console.log(
              `>>> Filtering PO by material: "${parameters.material}"`,
            );

            const materials = extractMultipleItems(parameters.material);
            console.log(
              `>>> Extracted ${materials.length} material:`,
              materials,
            );

            const allResults = new Map();

            for (const material of materials) {
              const materialFuse = new Fuse(purchaseOrdersResults, {
                keys: ["material", "Material"],
                includeScore: true,
                threshold: 0.4,
              });
              const searchResults = materialFuse.search(material);
              searchResults.forEach((result) => {
                if (!allResults.has(result.item.id)) {
                  allResults.set(result.item.id, result.item);
                }
              });
            }

            purchaseOrdersResults = Array.from(allResults.values());
            console.log(
              `>>> Found ${purchaseOrdersResults.length} orders with matching materials.`,
            );
          }

          if (parameters.status) {
            console.log(`>>> Filtering PO by status: "${parameters.status}"`);
            const statusFuse = new Fuse(purchaseOrdersResults, {
              keys: ["status", "Status"],
              includeScore: true,
              threshold: 0.4,
            });
            const statusSearchResults = statusFuse.search(parameters.status);
            purchaseOrdersResults = statusSearchResults.map(
              (result) => result.item,
            );
          }

          if (parameters.quantity) {
            console.log(
              `>>> Filtering PO by quantity: "${parameters.quantity}"`,
            );
            const targetQty = String(parameters.quantity).trim();
            purchaseOrdersResults = purchaseOrdersResults.filter((order) => {
              const orderQty = String(
                order.quantity || order.Quantity || order["Quantity"] || 1,
              ).trim();
              return orderQty === targetQty;
            });
          }

          if (parameters.order_value) {
            console.log(
              `>>> Filtering PO by order value condition: "${parameters.order_value}"`,
            );

            const condition = String(parameters.order_value).toLowerCase();

            // ===== FIXED VALUE PARSER =====
            const extractValue = (order) => {
              const raw =
                order["TOTAL ORDER VALUE"] ||
                order.value ||
                order["Order Value"] ||
                0;

              return Number(String(raw).replace(/[^\d.]/g, ""));
            };
            // ==============================

            if (condition.includes(">") || condition.includes("greater")) {
              const value = Number(condition.replace(/[^\d]/g, ""));
              purchaseOrdersResults = purchaseOrdersResults.filter(
                (order) => extractValue(order) > value,
              );
            }

            if (condition.includes("<") || condition.includes("less")) {
              const value = Number(condition.replace(/[^\d]/g, ""));
              purchaseOrdersResults = purchaseOrdersResults.filter(
                (order) => extractValue(order) < value,
              );
            }

            if (condition.includes("=") || condition.includes("equal")) {
              const value = Number(condition.replace(/[^\d]/g, ""));
              purchaseOrdersResults = purchaseOrdersResults.filter(
                (order) => extractValue(order) === value,
              );
            }
          }

          const poMappedData = purchaseOrdersResults.map((order) => ({
            "Vendor Code": order["Vendor Code"] || order.id || "N/A",
            "Vendor Name": order["Vendor Name"] || order.vendor || "N/A",
            City: order["City"] || "N/A",
            Quantity: order["Quantity"] || order.quantity || 1,
            "GST No.": order["GST No."] || "N/A",
            "Order Value": order["TOTAL ORDER VALUE"] || order.value || "N/A",
          }));
          console.log(`>>> Returning ${poMappedData.length} purchase orders.`);
          toolResult = {
            type: "table",
            tableColumns: [
              "Vendor Code",
              "Vendor Name",
              "City",
              "GST No.",
              "Order Value",
            ],
            tableData: poMappedData,
          };
          break;
        }

        default:
          console.warn(`>>> Unhandled tool detected: ${decision.tool_name}`);
          const fallbackTextPrompt = `The user said: "${originalUserQuery}". I decided to use a tool called '${decision.tool_name}' which isn't recognized. Ask the user to clarify or rephrase.`;
          
          // Injecting memory here
          const fallbackResult = await callGroqLLM(
            "You are a helpful SAP assistant.",
            fallbackTextPrompt,
            false,
            previousHistory
          );
          
          const fallbackContent =
            fallbackResult && !fallbackResult.error
              ? fallbackResult
              : "Sorry, I couldn't process that request. Could you please rephrase?";
          toolResult = { type: "text", content: fallbackContent };
      }
      res.json(toolResult);
    } else if (decision.type === "text") {
      console.log(">>> AI decided to have a normal conversation.");
      const contentToSend = cleanAiText(
        decision.content || "Sorry, I couldn't generate a response.",
      );
      res.json({ type: "text", content: contentToSend });
    } else {
      console.error(">>> Unexpected decision format received:", decision);
      res
        .status(500)
        .json({ error: "Received an unexpected response format from the AI." });
    }
  } catch (error) {
    console.error(
      ">>> Error in /api/chat endpoint:",
      error.message,
      error.stack,
    );
    res.status(500).json({
      error: "An internal server error occurred processing your request.",
    });
  }
});

// === submit endpoint ===
app.post("/api/submit" + String.fromCharCode(45) + "leave", (req, res) => {
  const newLeaveData = req.body;
  console.log(">>> Received leave submission ", newLeaveData);
  if (
    !newLeaveData ||
    typeof newLeaveData !== "object" ||
    Object.keys(newLeaveData).length === 0
  ) {
    console.error(">>> Invalid leave data received.");
    return res.status(400).json({ error: "Invalid leave data provided." });
  }
  try {
    let leaveApplications = readJsonSafely(leaveDbPath, []);
    if (!Array.isArray(leaveApplications)) {
      console.error(">>> Leave applications data is not an array. Resetting.");
      leaveApplications = [];
    }
    const newEntry = { id: Date.now(), ...newLeaveData, status: "Submitted" };
    leaveApplications.push(newEntry);
    console.log(">>> Writing new leave application to file.");
    fs.writeFileSync(leaveDbPath, JSON.stringify(leaveApplications, null, 2));
    console.log(">>> Leave application saved successfully.");
    res.json({
      type: "text",
      content:
        "Thanks! Your leave application has been successfully submitted and saved.",
    });
  } catch (error) {
    console.error(">>> Error saving leave application:", error);
    res.status(500).json({ error: "Failed to save the leave application." });
  }
});

// === Server Start for Render ===
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ SAP Assistant Backend is running on port ${PORT}`);
});