// OpenCode Custom Provider Configuration
// Provider: tokenharbor (OpenAI-compatible)
// API Key: read from environment variable TOKENHARBOR_API_KEY (live key not embedded for security)

const config = {
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "tokenharbor": {
      "id": "tokenharbor",
      "baseURL": "https://api.tokenharbor.ai/v1",
      "apiType": "openai",
      "options": {
        "apiKey": process.env.TOKENHARBOR_API_KEY || "thk_live_PLACEHOLDER",
        "baseURL": "https://api.tokenharbor.ai/v1"
      },
      "models": {
        "deepseek-v4.1-flash:free": {
          "id": "deepseek-v4.1-flash:free",
          "reasoning": false,
          "modalities": { "input": ["text"], "output": ["text"] },
          "cost": { "input": 0, "output": 0, "cache_write": 0, "cache_read": 0 }
        },
        "deepseek-v4-flash:free": {
          "id": "deepseek-v4-flash:free",
          "reasoning": false,
          "modalities": { "input": ["text"], "output": ["text"] },
          "cost": { "input": 0, "output": 0, "cache_write": 0, "cache_read": 0 }
        },
        "mimo-v2.5:free": {
          "id": "mimo-v2.5:free",
          "reasoning": false,
          "modalities": { "input": ["text"], "output": ["text"] },
          "cost": { "input": 0, "output": 0, "cache_write": 0, "cache_read": 0 }
        }
      }
    }
  }
};

module.exports = config;
