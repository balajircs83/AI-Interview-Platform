# AI Interview Platform

A professional AI-powered interview simulation platform with real-time speech recognition and intelligent evaluation using Groq API.

## Features

- 🎥 **Live Video Feed**: Real-time camera integration
- 🎤 **Speech Recognition**: Live speech-to-text transcription
- 🤖 **AI Evaluation**: Intelligent response analysis using Groq LLaMA models
- 📊 **Real-time Feedback**: Instant scoring and constructive feedback
- 🎯 **Multi-Question Flow**: Complete interview simulation
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

### Frontend
- **HTML5/CSS3**: Modern responsive design
- **Vanilla JavaScript**: No framework dependencies
- **Web APIs**: MediaRecorder, Speech Recognition, getUserMedia
- **Real-time Audio**: Web Audio API for equalizer visualization

### Backend (Node.js)
- **Express.js**: Web server framework
- **CORS**: Cross-origin resource sharing
- **Helmet**: Security middleware
- **dotenv**: Environment configuration

### AI Integration
- **Groq API**: LLaMA 3.1 70B model for evaluation
- **Real-time Processing**: Instant response analysis
- **Structured Feedback**: JSON-based evaluation system

## Quick Start

### Prerequisites
- Node.js 16+ installed
- Modern browser (Chrome, Edge, Safari, Firefox)
- Microphone and camera permissions

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-interview-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   # Copy .env file and update with your Groq API key
   cp .env.example .env
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   ```
   http://localhost:3000
   ```

### Production Deployment

```bash
# Install production dependencies
npm install --production

# Start production server
npm start
```

## Project Structure

```
ai-interview-platform/
├── public/                 # Frontend files
│   ├── index.html         # Main HTML file
│   └── script.js          # Frontend JavaScript
├── server.js              # Express server
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## API Endpoints

### Current Endpoints
- `GET /` - Serve main application
- `GET /health` - Health check endpoint

### Future Backend API (Planned)
- `POST /api/interviews` - Create new interview session
- `POST /api/evaluate` - Evaluate interview response
- `GET /api/interviews/:id` - Get interview results
- `POST /api/upload-audio` - Upload audio for processing

## Environment Variables

```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# Groq API Configuration
GROQ_API_KEY=your_groq_api_key_here
GROQ_API_URL=https://api.groq.com/openai/v1/chat/completions
```

## Browser Compatibility

| Feature | Chrome | Edge | Safari | Firefox |
|---------|--------|------|--------|---------|
| MediaRecorder | ✅ | ✅ | ✅ | ✅ |
| Speech Recognition | ✅ | ✅ | ✅ | ❌ |
| getUserMedia | ✅ | ✅ | ✅ | ✅ |
| Web Audio API | ✅ | ✅ | ✅ | ✅ |

## Development

### Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (placeholder)

### Adding New Features

1. **Frontend Changes**: Edit files in `/public/`
2. **Backend API**: Add routes in `server.js` or create separate route files
3. **Environment Config**: Update `.env` for new configuration

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Controlled cross-origin requests
- **CSP**: Content Security Policy
- **Input Validation**: Request size limits

## Performance Optimizations

- **Static File Serving**: Efficient asset delivery
- **Codec Fallbacks**: Multiple audio format support
- **Error Handling**: Graceful degradation
- **Memory Management**: Proper cleanup of media streams

## Troubleshooting

### Common Issues

1. **Microphone Permission Denied**
   - Ensure HTTPS or localhost
   - Check browser permissions
   - Refresh page and allow access

2. **Speech Recognition Not Working**
   - Use Chrome, Edge, or Safari
   - Check internet connection
   - Verify microphone is working

3. **Recording Fails**
   - Check MediaRecorder support
   - Verify codec compatibility
   - Ensure sufficient storage space

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue in the repository
- Check browser console for error messages
- Verify all dependencies are installed correctly