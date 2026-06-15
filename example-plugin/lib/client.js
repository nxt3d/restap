// RESTAP Text Agent Client Library
// Enhanced client for interacting with text processing agents

class TextAgentClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.validateInput = options.validateInput !== false;
    this.timeout = options.timeout || 30000;
  }

  async discoverCapabilities() {
    const response = await fetch(`${this.baseUrl}/.well-known/restap.json`);
    return response.json();
  }

  async talk(message) {
    const response = await fetch(`${this.baseUrl}/talk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    return response.json();
  }

  async echoText(text) {
    if (this.validateInput && (!text || typeof text !== 'string')) {
      throw new Error('Invalid text input');
    }

    const response = await fetch(`${this.baseUrl}/text/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return response.json();
  }

  async reverseText(text) {
    if (this.validateInput && (!text || typeof text !== 'string')) {
      throw new Error('Invalid text input');
    }

    const response = await fetch(`${this.baseUrl}/text/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return response.json();
  }

  async checkNews() {
    const response = await fetch(`${this.baseUrl}/news`);
    return response.json();
  }
}

module.exports = TextAgentClient;