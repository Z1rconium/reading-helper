# Reading Helper

English | [简体中文](zh_README.md)

A Node.js-based English reading assistant with AI integration, designed for multi-user environments with isolated data storage and streaming AI responses.

## 📋 Project Overview

Reading Helper is a full-stack web application that combines text file management, AI-powered language learning features, and multi-user authentication. The system provides a single-page frontend interface with a robust Express backend handling user authentication, file persistence, conversation history, and AI provider abstraction via Server-Sent Events (SSE).

**Key Characteristics:**
- Multi-user isolation with session-based authentication
- Support for multiple AI providers (OpenAI, Anthropic)
- Real-time streaming AI responses via SSE
- Persistent conversation history per article
- Customizable system prompts per user
- File upload with Chinese filename support

## 🏗️ Technical Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Single-Page Application)                     │
│  • Static HTML/CSS/JS (~5300 lines)                     │
│  • D3.js & Markmap for visualizations                   │
│  • EventSource for SSE streaming                        │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/SSE
┌─────────────────────────────────────────────────────────┐
│  Express Backend (Node.js)                              │
│  ├─ Authentication Layer                                │
│  │  • express-session + Redis                           │
│  │  • Cloudflare Turnstile verification                 │
│  │  • CSRF protection (cookie + header)                 │
│  │  • Rate limiting (15min/5 attempts)                  │
│  ├─ Data Isolation Layer                                │
│  │  • Per-user file storage                             │
│  │  • Per-article conversation history                  │
│  │  • User-specific prompt templates                    │
│  └─ AI Provider Abstraction                             │
│     • Auto-detection (OpenAI/Anthropic)                 │
│     • SSE streaming proxy                               │
│     • Request/response format adaptation                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Storage & External Services                            │
│  • Redis: Session persistence                           │
│  • Filesystem: User data (uploads/chats/prompts)        │
│  • Upstream AI APIs: OpenAI/Anthropic                   │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Runtime: Node.js ≥18
- Framework: Express 4.x
- Session: express-session + connect-redis
- Storage: Redis (sessions), Filesystem (user data)
- Security: bcrypt, sanitize-html, express-rate-limit, CSRF protection
- File Upload: multer
- Compression: compression middleware

**Frontend:**
- Vanilla JavaScript (ES6+)
- D3.js (data visualization)
- Markmap (mind map rendering)
- DOMPurify (client-side HTML sanitization)
- Web Speech API (text-to-speech)

**AI Integration:**
- OpenAI Chat Completions API
- OpenAI Responses API
- Anthropic Messages API

## 📁 Project Structure

```
reading-helper/
├── config/                          # Configuration files
│   ├── platform.config.json         # Session secret
│   ├── users.config.json            # User credentials & AI provider configs
│   └── prompts/                     # Default system prompt templates
│       ├── explain-word.md
│       ├── analyze-sentence.md
│       ├── color-sentence.md
│       ├── summarize-paragraph.md
│       ├── translate-paragraph.md
│       ├── summary-evaluation.md
│       ├── mcq.md
│       ├── qa.md
│       ├── tf.md
│       ├── mindmap.md
│       └── send-button.md
├── data/
│   └── users/                       # User-isolated data storage
│       └── <userId>/
│           ├── uploads/             # Uploaded text files
│           ├── chats/               # Conversation histories
│           │   └── <articleBase64>/
│           │       └── <uuid>.json
│           └── prompts/             # User-edited prompts
├── server/                          # Backend modules
│   ├── index.js                     # Main Express app & routes
│   ├── config-loader.js             # Config validation & loading
│   ├── session-store.js             # Redis session store setup
│   ├── file-store.js                # File upload/read/delete
│   ├── chat-store.js                # Conversation persistence
│   ├── prompt-store.js              # Prompt template management
│   ├── user-paths.js                # User directory path resolution
│   ├── csrf-protection.js           # CSRF token validation
│   └── cleanup-orphaned-users.js    # Startup cleanup utility
├── public/
│   └── index.html                   # Single-page frontend (~5300 lines)
├── logs/                            # PM2 log output (created at runtime)
├── ecosystem.config.js              # PM2 cluster configuration
├── package.json
└── README.md
```

## ✨ Core Features

### 🔐 Authentication & Security
- Session-based authentication with 30-minute persistence
- Access key validation from `users.config.json`
- **Cloudflare Turnstile human verification** on login page
- Login rate limiting (5 attempts per 15 minutes)
- CSRF protection via cookie + header validation
- HTML sanitization (server: sanitize-html, client: DOMPurify)
- Automatic cleanup of orphaned user directories on startup

### 📄 File Management
- Upload `.txt` and `.text` files (max 2MB)
- Chinese filename support with proper encoding
- List, read, and delete operations
- Automatic chat history cleanup on file deletion

### 💬 Conversation System
- Multi-turn conversation persistence per article
- Conversation history stored as individual JSON files
- List, create, append, clear, and delete operations
- Automatic migration from legacy single-file format
- Base64url-encoded article names for directory safety

### 🤖 AI Integration
- Automatic provider detection based on API URL pattern
- Support for OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages APIs
- SSE streaming for real-time token-by-token rendering
- 120-second request timeout
- Per-user API configuration (URL, key, model)

### 📝 Prompt Management
- Default templates in `config/prompts/`
- Automatic per-user copy on first access
- User-editable prompts stored in `data/users/<userId>/prompts/`
- Built-in templates:
  - Word explanation (definitions, phonetics, collocations)
  - Sentence analysis (grammar, structure, translation)
  - Rainbow sentence parsing (JSON syntax tree)
  - Paragraph translation & summarization
  - Summary evaluation
  - Mind map generation
  - Multiple-choice, true/false, and open-ended questions
  - Send button (general Q&A)

### 🎨 Frontend Features
- Resizable reading panel with drag handles
- Adjustable font size
- Text selection triggers (word/sentence/paragraph)
- Text-to-speech with adjustable speed/volume/pitch
- Article context toggle (max 12,000 characters)
- Structured output rendering:
  - Syntax tree visualization (collapsible)
  - Interactive quiz components
  - Mind map rendering via Markmap
- CET4/CET6 vocabulary highlighting

## 🚀 PM2 Deployment

### Prerequisites

- Node.js ≥18
- Redis ≥6
- PM2 (install globally: `npm install -g pm2`)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd reading-helper

# Install dependencies
npm install
```

### Configuration

**1. Platform Configuration (`config/platform.config.json`):**

```json
{
  "session_secret": "REPLACE_WITH_STRONG_RANDOM_SECRET"
}
```

**2. User Configuration (`config/users.config.json`):**

```json
{
  "users": [
    {
      "userId": "demo",
      "accessKey": "REPLACE_WITH_SECURE_ACCESS_KEY",
      "provider": {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "api_key": "sk-...",
        "api_model": "gpt-4o"
      }
    }
  ]
}
```

**Validation Rules:**
- `userId`: Alphanumeric, underscore, and hyphen only
- `accessKey`: Must be unique across all users
- `api_url`: Auto-detects provider type (OpenAI/Anthropic)

**3. Cloudflare Turnstile Configuration:**

The application uses Cloudflare Turnstile for human verification on the login page. The site key and secret key are configured in:
- **Frontend** (`public/index.html`): Site key in `data-sitekey` attribute
- **Backend** (`server/index.js`): Secret key in login route handler

To use your own Turnstile keys:
1. Create a Turnstile site at [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Replace the site key in `public/index.html` (line 152)
3. Replace the secret key in `server/index.js` (line 467)

**4. Environment Variables:**

```bash
export REDIS_URL="redis://127.0.0.1:6379"
export PORT=3000
export CONFIG_DIR="./config"
export USER_DATA_ROOT="./data/users"
```

### PM2 Startup

```bash
# Start in cluster mode (4 instances)
pm2 start ecosystem.config.js

# View status
pm2 list

# View logs
pm2 logs reading-helper

# Monitor resources
pm2 monit
```

### PM2 Management Commands

```bash
# Restart application
pm2 restart reading-helper

# Reload with zero-downtime
pm2 reload reading-helper

# Stop application
pm2 stop reading-helper

# Delete from PM2
pm2 delete reading-helper

# Save current process list
pm2 save

# Setup startup script
pm2 startup
# Follow the displayed command (may require sudo)
```

### Cluster Configuration

The included `ecosystem.config.js` runs 4 instances by default. Adjust based on CPU cores:

```javascript
module.exports = {
  apps: [{
    name: 'reading-helper',
    script: './server/index.js',
    instances: 'max',  // Use all available CPU cores
    exec_mode: 'cluster',
    max_memory_restart: '500M',
    // ...
  }]
};
```

### Reverse Proxy (Nginx)

For SSE streaming to work correctly, disable buffering:

```nginx
location / {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  
  # Critical for SSE
  proxy_buffering off;
  proxy_read_timeout 86400;
}
```

## 🔧 Common Issues

### Redis Connection Errors

**Symptom:** `缺少 REDIS_URL 环境变量` or connection timeout

**Solution:**
- Ensure `REDIS_URL` environment variable is set
- Verify Redis is running: `redis-cli ping` (should return `PONG`)
- Check Redis connection string format: `redis://host:port` or `redis://user:pass@host:port`

### CSRF Token Validation Failures

**Symptom:** `CSRF token 缺失/验证失败` on login or API requests

**Solution:**
- Ensure cookies are enabled in browser
- Check reverse proxy preserves `Set-Cookie` and `Cookie` headers
- For cross-origin requests, configure CORS properly and use `credentials: 'include'`
- Clear browser cookies and retry

### Turnstile Verification Failures

**Symptom:** Login button remains disabled or shows "人机验证失败"

**Solution:**
- Verify Cloudflare Turnstile site key is correct in `public/index.html`
- Confirm secret key matches in `server/index.js`
- Check browser console for Turnstile loading errors
- Ensure `challenges.cloudflare.com` is accessible (not blocked by firewall/ad blocker)
- Try refreshing the page to reload Turnstile widget
- Verify Turnstile site domain matches your deployment domain in Cloudflare Dashboard

### SSE Streaming Issues

**Symptom:** AI responses not streaming or frequent disconnections

**Solution:**
- Disable proxy buffering in Nginx/Apache (see reverse proxy config above)
- Increase `proxy_read_timeout` to at least 120 seconds
- Check browser console for EventSource errors
- Verify upstream AI API is accessible

### AI Response Errors

**Symptom:** Empty responses or parsing failures

**Solution:**
- Verify `api_url` points to correct endpoint:
  - OpenAI: `https://api.openai.com/v1/chat/completions`
  - Anthropic: `https://api.anthropic.com/v1/messages`
- Confirm `api_key` is valid and has sufficient quota
- Check `api_model` is supported by the provider
- Review server logs for detailed error messages

### File Upload Failures

**Symptom:** Upload rejected or file not appearing in list

**Solution:**
- Verify file extension is `.txt` or `.text`
- Check file size is under 2MB (configurable via `MAX_UPLOAD_BYTES`)
- Ensure `data/users/<userId>/uploads/` directory exists and is writable
- Review filename for invalid characters (should be sanitized automatically)

### Mind Map Not Rendering

**Symptom:** Mind map button does nothing or shows blank modal

**Solution:**
- Check browser console for CDN loading errors
- Verify `markmap-view` and `d3` CDN URLs are accessible
- Consider hosting these libraries locally if CDN is blocked
- Ensure AI response contains valid Markdown format

### Text-to-Speech Unavailable

**Symptom:** Read aloud button disabled or not working

**Solution:**
- Use a browser with Web Speech API support (Chrome, Edge, Safari recommended)
- Check browser permissions for speech synthesis
- Verify page is served over HTTPS (required by some browsers)

### Prompt Save Failures (403)

**Symptom:** `userId 参数不一致` or permission denied

**Solution:**
- Ensure `userId` in request matches session user
- Check session hasn't expired (7-day limit)
- Verify user exists in `users.config.json`
- Clear cookies and re-login if session is corrupted

## 📊 Recommended Server Specifications

| Scenario | vCPU | RAM | Storage | Concurrent Users |
|----------|------|-----|---------|------------------|
| Development/Testing | 2 | 2 GB | 20 GB | 1-5 |
| Small Team | 4 | 4-8 GB | 40 GB | 5-20 |
| Medium Organization | 8 | 16 GB | 80 GB | 20-50 |

**Notes:**
- Redis should be deployed separately or use managed service for production
- Storage requirements scale with uploaded files and conversation history
- PM2 cluster mode scales horizontally with CPU cores
- Consider load balancer for >50 concurrent users

## 📜 License

MIT
