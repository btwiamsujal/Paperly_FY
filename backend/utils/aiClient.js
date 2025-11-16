const OpenAI = require("openai");
const fetch = require("node-fetch");

// Groq (OpenAI-compatible) client
let groqClient = null;
if (process.env.GROQ_API_KEY) {
  groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

// Gemini configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;

// List of Gemini models to try in order (from most preferred to fallback)
// Use the v1beta API which has broader model support
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || "gemini-1.5-flash-8b",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro"
];

let currentGeminiModelIndex = 0;

// Circuit breaker state for Groq rate limiting
let groqCircuitState = {
  failureCount: 0,
  lastFailureTime: null,
  isOpen: false,
  resetTimeout: 60000, // 1 minute
  failureThreshold: 3
};

async function callGeminiWithModel(prompt, modelName) {
  if (!GEMINI_API_KEY) return { success: false, error: "No API key" };

  // Use v1beta API which has better model support
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      
      // Return structured error info for retry logic
      return {
        success: false,
        status: res.status,
        error: text.slice(0, 500),
        shouldRetryWithDifferentModel: res.status === 404
      };
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("").trim();
    
    if (text) {
      return { success: true, text };
    }
    return { success: false, error: "Empty response" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    console.warn("Gemini API key not configured");
    return null;
  }

  // Try models in order, starting from current successful model
  for (let attempt = 0; attempt < GEMINI_MODELS.length; attempt++) {
    const modelIndex = (currentGeminiModelIndex + attempt) % GEMINI_MODELS.length;
    const model = GEMINI_MODELS[modelIndex];
    
    console.log(`Trying Gemini model: ${model}`);
    const result = await callGeminiWithModel(prompt, model);
    
    if (result.success) {
      // Update current working model
      currentGeminiModelIndex = modelIndex;
      console.log(`✓ Gemini success with model: ${model}`);
      return result.text;
    }
    
    // Log failure and try next model if 404
    console.warn(`✗ Gemini model ${model} failed:`, result.error?.substring(0, 100));
    
    if (!result.shouldRetryWithDifferentModel) {
      // Non-404 errors shouldn't trigger model fallback
      console.error(`Gemini error (non-retryable): ${result.status}`);
      return null;
    }
  }
  
  console.error("All Gemini models failed");
  return null;
}

function checkCircuitBreaker() {
  if (!groqCircuitState.isOpen) return false;
  
  // Check if enough time has passed to try again
  const timeSinceFailure = Date.now() - groqCircuitState.lastFailureTime;
  if (timeSinceFailure > groqCircuitState.resetTimeout) {
    console.log("Circuit breaker reset - trying Groq again");
    groqCircuitState.isOpen = false;
    groqCircuitState.failureCount = 0;
    return false;
  }
  
  return true;
}

function recordGroqFailure(isRateLimit) {
  if (isRateLimit) {
    groqCircuitState.failureCount++;
    groqCircuitState.lastFailureTime = Date.now();
    
    if (groqCircuitState.failureCount >= groqCircuitState.failureThreshold) {
      groqCircuitState.isOpen = true;
      console.warn(`⚠ Groq circuit breaker OPEN (${groqCircuitState.failureCount} failures). Will retry after ${groqCircuitState.resetTimeout/1000}s`);
    }
  }
}

function recordGroqSuccess() {
  groqCircuitState.failureCount = 0;
  groqCircuitState.isOpen = false;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGroq(prompt, maxRetries = 3) {
  if (!groqClient) {
    console.warn("Groq client not configured");
    return null;
  }
  
  // Check circuit breaker
  if (checkCircuitBreaker()) {
    console.warn("Groq circuit breaker is OPEN - skipping call");
    return null;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const completion = await groqClient.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.2,
        messages: [
          { role: "user", content: prompt },
        ],
      });

      const content = completion.choices?.[0]?.message?.content?.trim() || "";
      
      if (content) {
        recordGroqSuccess();
        console.log(`✓ Groq success on attempt ${attempt + 1}`);
        return content;
      }
      return null;
    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.code === 'rate_limit_exceeded';
      const errorMsg = err?.response?.data || err?.message || err;
      
      console.error(`✗ Groq attempt ${attempt + 1}/${maxRetries} failed:`, 
        isRateLimit ? "Rate limit (429)" : errorMsg);
      
      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff with jitter: 1s, 2s, 4s + random
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        
        console.log(`  Retrying in ${(delay/1000).toFixed(1)}s...`);
        await sleep(delay);
        continue;
      }
      
      // Record failure for circuit breaker
      recordGroqFailure(isRateLimit);
      return null;
    }
  }
  
  console.error("Groq: All retry attempts exhausted");
  return null;
}

function parseJsonSafely(content) {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (_) {
    // Try to salvage JSON inside fenced blocks or surrounding text
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }
  }
  return null;
}

async function askAI(prompt) {
  // Prefer Gemini for speed; fall back to Groq if unavailable or fails
  const geminiText = await callGemini(prompt);
  if (geminiText) return geminiText;

  const groqText = await callGroq(prompt);
  if (groqText) return groqText;

  return ""; // graceful fallback
}

async function askAIJson(prompt) {
  // Prefer Gemini JSON; fallback to Groq JSON; both reuse parseJsonSafely
  const geminiText = await callGemini(prompt);
  const geminiJson = parseJsonSafely(geminiText);
  if (geminiJson) return geminiJson;

  const groqText = await callGroq(prompt);
  const groqJson = parseJsonSafely(groqText);
  if (groqJson) return groqJson;

  return null;
}

module.exports = {
  askAI,
  askAIJson,
};
