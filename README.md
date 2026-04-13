# Reading Helper

English | [简体中文](zh_README.md)

A Node.js-based English reading assistant with AI integration, designed for multi-user environments with isolated data storage and streaming AI responses.

## 📋 Project Overview

Reading Helper is a full-stack web application that combines text file management, AI-powered language learning features, and multi-user authentication. The system provides a modern single-page application frontend with a robust Express backend handling user authentication, file persistence, conversation history, and AI provider abstraction via Server-Sent Events (SSE).

**Key Characteristics:**
- Multi-user isolation with session-based authentication
- Support for multiple AI providers (OpenAI Chat Completions, OpenAI Responses, Anthropic Messages)
- Real-time streaming AI responses via SSE
- Persistent conversation history per article
- Customizable system prompts per user
- File upload with Chinese filename support
- CET4/CET6 vocabulary highlighting

## 🏗️ Technical Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Single-Page Application)                     │
│  • HTML (227 lines) + CSS (~2300 lines) + JS (~7800 lines)│
│  • Modular architecture (core/utils/modules)            │
│  • D3.js & Markmap for visualizations                   │
│  • EventSource for SSE streaming                        │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/SSE
┌─────────────────────────────────────────────────────────┐
│  Express Backend (Node.js, 1013 lines)                  │
│  ├─ Authentication Layer                                │
│  │  • express-session + Redis                           │
│  │  • Cap.js CAPTCHA verification                       │
│  │  • CSRF protection (cookie + header)                 │
│  │  • Rate limiting (15min/5 attempts)                  │
│  ├─ Data Isolation Layer                                │
│  │  • Per-user file storage                             │
│  │  • Per-article conversation history                  │
│  │  • User-specific prompt templates                    │
│  └─ AI Provider Abstraction                             │
│     • Auto-detection (OpenAI/Anthropic)                 │
│     • SSE streaming proxy with connection pooling       │
│     • Request/response format adaptation                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Storage & External Services                            │
│  • Redis: Session persistence (30-minute timeout)       │
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
- Security: sanitize-html, express-rate-limit, CSRF protection, Cap.js CAPTCHA
- File Upload: multer (max 2MB)
- Compression: compression middleware with optimized settings
- HTTP Connection Pooling: keepAlive agents for AI requests

**Frontend:**
- Vanilla JavaScript (ES6+) with modular architecture
  - Core: state management, DOM utilities
  - Utils: API client, helpers
  - Modules: vocab highlighting, speech synthesis, mindmap
- D3.js (data visualization)
- Markmap (mind map rendering)
- DOMPurify (client-side HTML sanitization)
- Web Speech API + Edge TTS streaming
- Cap.js CAPTCHA widget (forked)
- Responsive design with resizable panels

**AI Integration:**
- OpenAI Chat Completions API
- OpenAI Responses API
- Anthropic Messages API (with proper headers)
- Auto-detection based on API URL pattern
- 120-second request timeout for chat, 30s for TTS
- SSE streaming with buffer overflow protection
- HTTP connection pooling with keepAlive
- Edge TTS API proxy with zero-memory streaming

## 📁 Project Structure

```
reading-helper/
├── config/                          # Configuration files
│   ├── platform.config.json         # Session secret
│   ├── users.config.json            # User credentials & AI provider configs
│   ├── cet_word_list.txt            # CET4/CET6 vocabulary list (cached in memory)
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
│   ├── index.js                     # Main Express app & routes (864 lines)
│   ├── config-loader.js             # Config validation & loading
│   ├── session-store.js             # Redis session store setup
│   ├── file-store.js                # File upload/read/delete
│   ├── chat-store.js                # Conversation persistence
│   ├── prompt-store.js              # Prompt template management
│   ├── user-paths.js                # User directory path resolution
│   ├── csrf-protection.js           # CSRF token validation
│   └── cleanup-orphaned-users.js    # Startup cleanup utility
├── public/
│   ├── index.html                   # Main HTML structure (227 lines)
│   ├── css/
│   │   └── main.css                 # Styles (~2300 lines)
│   └── js/
│       ├── main.js                  # Application entry point
│       ├── core/
│       │   ├── state.js             # State management
│       │   └── dom.js               # DOM utilities
│       ├── utils/
│       │   ├── api.js               # API client
│       │   └── helpers.js           # Helper functions
│       ├── modules/
│       │   ├── vocab.js             # CET vocabulary highlighting
│       │   ├── speech.js            # Text-to-speech
│       │   └── mindmap.js           # Mindmap visualization
│       └── vendor/
│           └── cap-widget/          # Cap.js CAPTCHA widget
├── logs/                            # PM2 log output (created at runtime)
├── .vendor/
│   └── cap-widget-fork/             # Forked Cap.js widget source
├── ecosystem.config.js              # PM2 cluster configuration
├── package.json
└── README.md
```

## ✨ Core Features

### 🔐 Authentication & Security
- Session-based authentication with 3-hour timeout
- Access key validation from `users.config.json`
- **Cloudflare Turnstile CAPTCHA verification** on login page
- Login rate limiting (5 attempts per 15 minutes)
- CSRF protection via cookie + header validation
- HTML sanitization (server: sanitize-html, client: DOMPurify)
- Automatic cleanup of orphaned user directories on startup
- Secure session cookies with httpOnly and sameSite protection

### 📄 File Management
- Upload `.txt`, `.text`, and `.md` files (max 2MB, configurable)
- Chinese filename support with proper encoding
- List, read, and delete operations
- Automatic chat history cleanup on file deletion
- Path traversal protection with filename validation

### 💬 Conversation System
- Multi-turn conversation persistence per article
- Conversation history stored as individual JSON files
- List, create, append, clear, and delete operations
- Automatic migration from legacy single-file format
- Base64url-encoded article names for directory safety

### 🤖 AI Integration
- Automatic provider detection based on API URL pattern:
  - URLs containing `anthropic` or ending with `/messages` → Anthropic Messages API
  - URLs ending with `/responses` → OpenAI Responses API
  - Otherwise → OpenAI Chat Completions API
- SSE streaming for real-time token-by-token rendering
- 120-second request timeout with abort controller
- Per-user API configuration (URL, key, model)
- HTTP connection pooling with keepAlive for performance
- Buffer overflow protection (10KB max SSE buffer)
- Proper Anthropic API headers (`Authorization`, `x-api-key`, `anthropic-version`)

### 📝 Prompt Management
- Default templates in `config/prompts/`
- Automatic per-user copy on first access
- User-editable prompts stored in `data/users/<userId>/prompts/`
- Built-in templates:
  - Word explanation (definitions, phonetics, collocations)
  - Sentence analysis (grammar, structure, translation)
  - Rainbow sentence parsing (JSON syntax tree)
  - Paragraph summarization
  - Summary evaluation
  - Mind map generation
  - Multiple-choice, true/false, and open-ended questions
  - Send button (general Q&A)

### 🎨 Frontend Features
- Resizable reading panel with drag handles
- Adjustable font size (A+/A- controls)
- Text selection triggers (word/sentence/paragraph)
- Text-to-speech with adjustable speed/volume/pitch (Web Speech API + Edge TTS streaming)
- Persistent user preferences for speech settings (speed, volume, pitch, voice)
- Concurrent audio fetching for improved TTS performance
- Article context toggle (max 12,000 characters)
- Model badge display showing which AI model generated each response
- Structured output rendering:
  - Syntax tree visualization (collapsible)
  - Interactive quiz components (MCQ, True/False, Q&A)
  - Mind map rendering via Markmap
- CET4/CET6 vocabulary highlighting (cached in memory)
- Responsive design with modern UI
- Real-time SSE streaming display
- Performance monitoring (memory usage logged every 5 minutes, slow request logging)

## 🚀 PM2 Deployment

### Prerequisites

- Node.js ≥18
- Redis ≥6
- PM2 (install globally: `npm install -g pm2`)
- **Production environment: Debian 13** (do not test on macOS)

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

The application uses Cloudflare Turnstile for CAPTCHA verification on the login page. Configuration:
- **Frontend**: Turnstile widget loaded from Cloudflare CDN
- **Backend**: Site verification via Cloudflare API

Get your Turnstile keys at: https://dash.cloudflare.com/

Environment variables:
```bash
export TURNSTILE_SITE_KEY="your-site-key"
export TURNSTILE_SECRET_KEY="your-secret-key"
```

**4. Environment Variables:**

```bash
export REDIS_URL="redis://127.0.0.1:6379"
export PORT=3000
export CONFIG_DIR="./config"
export USER_DATA_ROOT="./data/users"
export TURNSTILE_SITE_KEY="your-site-key"
export TURNSTILE_SECRET_KEY="your-secret-key"
export MAX_UPLOAD_BYTES=2097152  # Optional, default 2MB
export TRUST_PROXY=1  # Optional, for reverse proxy
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

### Cloudflare Turnstile Verification Failures

**Symptom:** Login button remains disabled or CAPTCHA fails to load

**Solution:**
- Verify `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` environment variables are set correctly
- Check browser console for Turnstile widget loading errors
- Ensure Cloudflare Turnstile endpoints are accessible (not blocked by firewall)
- Try refreshing the page to reload CAPTCHA widget
- Verify your Turnstile keys are valid at https://dash.cloudflare.com/
- Check server logs for CAPTCHA verification errors

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
- Verify file extension is `.txt`, `.text`, or `.md`
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
- Check session hasn't expired (30-minute timeout)
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
