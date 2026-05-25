
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `Role: You are a specialized OCR-to-HTML engine. Your sole purpose is to extract tabular data from an image and output it as raw HTML code.

Task:
1. Identify the rows and columns in the provided image.
2. Extract the text exactly as written.
3. Specific Format: Output a simple HTML table with a border attribute.

Strict Output Rules (You must follow these):
- Start your response immediately with <table border="1">.
- End your response immediately with </table>.
- Use ONLY the tags: <table>, <tr>, <td>, <th> (optional for headers).
- Do NOT use any CSS, <style> tags, class attributes, or id attributes.
- Do NOT wrap the output in markdown code blocks (e.g., do not use \`\`\`html ... \`\`\`).
- Do NOT include <html>, <head>, or <body> tags.
- Do NOT output any conversational text, explanations, or labels.`;

export const analyzeTableImage = async (base64Image: string, mimeType: string, excludedKeywords: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const promptText = excludedKeywords.trim() 
    ? `Extract the table from this image. However, strictly EXCLUDE any rows where the label matches these keywords: ${excludedKeywords}. Output only raw HTML <table border="1">...`
    : `Extract the table from this image. Output only raw HTML <table border="1">...`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: mimeType,
            },
          },
          {
            text: promptText
          }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        // Disable thinking for faster responses
        thinkingConfig: {
          thinkingBudget: 0
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Model returned an empty response.");
    }
    
    return text.trim();
  } catch (error: any) {
    console.error("Gemini OCR Error:", error);
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API Key issue or model access error. Please ensure you are using a valid project key.");
    }
    throw error;
  }
};

const TEMPLATE_SYSTEM_INSTRUCTION = `Role: You are a specialized data extraction and HTML population engine.
Task:
1. Analyze the provided source (image or text) to extract tabular or structured data.
2. Analyze the provided HTML template to understand its structure, specifically the number of columns.
3. VALIDATION STEP: Compare the number of columns in the extracted data with the number of columns in the HTML template.
   - If the data has a different number of columns than the template, strictly output "ERROR: COLUMN_MISMATCH" and nothing else.
4. If the columns match, populate the HTML template with the data.
5. Maintain the exact structure, classes, styles, and attributes of the provided HTML template. Only replace the content within the tags.
6. If the source has more rows than the template, repeat the row structure of the template to accommodate the data.

Strict Output Rules:
- Output ONLY the populated HTML code OR the error string "ERROR: COLUMN_MISMATCH".
- Do NOT wrap the output in markdown code blocks.
- Do NOT include any conversational text.`;

const RELAXED_TEMPLATE_SYSTEM_INSTRUCTION = `Role: You are a specialized data extraction and HTML population engine.
Task:
1. Analyze the provided source (image or text) to extract tabular or structured data.
2. Analyze the provided HTML template to understand its structure.
3. Populate the HTML template with the data.
   - Fit the data into the template columns as best as possible.
   - If there are fewer data columns than template columns, leave the extra template columns empty.
   - If there are more data columns, merge them intelligently or ignore the excess if they don't fit the context.
4. Maintain the exact structure, classes, styles, and attributes of the provided HTML template. Only replace the content within the tags.
5. If the source has more rows than the template, repeat the row structure of the template to accommodate the data.

Strict Output Rules:
- Output ONLY the populated HTML code.
- Do NOT wrap the output in markdown code blocks.
- Do NOT include any conversational text.`;

export const fillHtmlTemplate = async (
  source: { type: 'image', data: string, mimeType?: string } | { type: 'text', content: string }, 
  htmlTemplate: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const runGeneration = async (transpose: boolean, strict: boolean = true) => {
    let promptText = `Here is an HTML template:
\`\`\`html
${htmlTemplate}
\`\`\`

`;

    const parts: any[] = [];

    if (source.type === 'image') {
      promptText += `Here is an image containing data.\n`;
      if (transpose) {
        promptText += `TASK: Extract the data from the image, then TRANSPOSE it (swap rows and columns).\n`;
      } else {
        promptText += `TASK: Extract the data from the image.\n`;
      }
      
      if (strict) {
        promptText += `Populate the HTML template above with the data.
Check if the number of columns in the data matches the template.
Return the full, populated HTML code or the error message.`;
      } else {
        promptText += `Populate the HTML template above with the data.
Fit the data as best as possible into the template structure.`;
      }
      
      parts.push({
        inlineData: {
          data: source.data.split(',')[1],
          mimeType: source.mimeType,
        },
      });
    } else {
      promptText += `Here is the source text containing data:
\`\`\`text
${source.content}
\`\`\`

`;
      if (transpose) {
        promptText += `TASK: Extract the data from the text, then TRANSPOSE it (swap rows and columns).\n`;
      } else {
        promptText += `TASK: Extract the data from the text.\n`;
      }
      
      if (strict) {
        promptText += `Populate the HTML template above with the data.
Check if the number of columns in the data matches the template.
Return the full, populated HTML code or the error message.`;
      } else {
        promptText += `Populate the HTML template above with the data.
Fit the data as best as possible into the template structure.`;
      }
    }

    parts.push({ text: promptText });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), 60000);
    });

    const response: GenerateContentResponse = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: parts
        },
        config: {
          systemInstruction: strict ? TEMPLATE_SYSTEM_INSTRUCTION : RELAXED_TEMPLATE_SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingBudget: 0
          }
        },
      }),
      timeoutPromise
    ]);

    const text = response.text;
    if (!text) {
      throw new Error("Model returned an empty response.");
    }
    return text.trim();
  };

  try {
    // Attempt 1: Standard Strict
    let result = await runGeneration(false, true);

    if (result.includes("ERROR: COLUMN_MISMATCH")) {
      console.log("Column mismatch detected. Retrying with transposition...");
      // Attempt 2: Transpose Strict
      result = await runGeneration(true, true);
      
      if (result.includes("ERROR: COLUMN_MISMATCH")) {
        console.log("Transposition failed. Attempting force fit...");
        // Attempt 3: Force Fit (Relaxed, No Transpose)
        result = await runGeneration(false, false);
      }
    }
    
    return result;
  } catch (error: any) {
    console.error("Gemini Template Fill Error:", error);
    if (error.message === "Request timed out") {
      throw new Error("Request timed out. Please try again with a smaller image or simpler template.");
    }
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API Key issue or model access error. Please ensure you are using a valid project key.");
    }
    throw error;
  }
};
