const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Add fetch polyfill for Node.js
if (!global.fetch) {
    global.fetch = require('node-fetch');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware - more permissive for development
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                connectSrc: [
                    "'self'",
                    "https://api.groq.com",
                    "https://speech.googleapis.com",
                    "https://www.google.com",
                    "wss://speech.googleapis.com",
                    "https://*.googleapis.com"
                ],
                mediaSrc: ["'self'", "blob:", "data:"],
                imgSrc: ["'self'", "data:", "blob:"],
                fontSrc: ["'self'", "data:"],
                objectSrc: ["'none'"],
                frameSrc: ["'none'"]
            }
        }
    }));
} else {
    // More permissive CSP for development
    app.use(helmet({
        contentSecurityPolicy: false, // Disable CSP in development
        crossOriginEmbedderPolicy: false
    }));
}

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://yourdomain.com']
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add headers for speech recognition support
app.use((req, res, next) => {
    // Allow speech recognition APIs
    res.setHeader('Permissions-Policy', 'microphone=*, camera=*, geolocation=()');

    // Ensure proper MIME types
    if (req.path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    }

    next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        speechRecognitionSupport: {
            requiresHTTPS: true,
            currentProtocol: req.protocol,
            isSecure: req.secure || req.get('x-forwarded-proto') === 'https'
        }
    });
});

// API routes
app.post('/api/evaluate', async (req, res) => {
    try {
        const { question, answer } = req.body;
        
        if (!question || !answer) {
            return res.status(400).json({ 
                error: 'Missing required fields: question and answer' 
            });
        }

        const prompt = `You are a strict professional interview evaluator. Evaluate this interview response honestly and provide accurate scoring.

Interview Question: "${question}"

Candidate's Answer: "${answer}"

IMPORTANT EVALUATION RULES:
- If the answer is "I don't know" or similar non-answers, score should be 1.0-2.0
- If the answer is irrelevant or off-topic, score should be 1.5-2.5
- If the answer lacks substance or detail, score should be 2.0-3.0
- Only give high scores (4.0+) for genuinely good, detailed, relevant answers
- Be honest and critical in your evaluation

Please provide your evaluation in the following JSON format:
{
    "overall": [score from 1.0 to 5.0],
    "feedback": "[detailed honest feedback paragraph]",
    "strengths": ["strength1", "strength2", "strength3"],
    "improvements": ["improvement1", "improvement2", "improvement3"]
}

Evaluation Criteria:
- Relevance to the question (25%) - Does it actually answer what was asked?
- Communication clarity (25%) - Is it clear and well-articulated?
- Technical depth/examples (25%) - Are there specific details and examples?
- Professional presentation (25%) - Is it professional and well-structured?

Be honest and constructive. Poor answers should receive low scores.`;

        const groqResponse = await fetch(process.env.GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-70b-versatile",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1000
            })
        });

        if (!groqResponse.ok) {
            const errorData = await groqResponse.json().catch(() => ({}));
            console.error('Groq API Error:', errorData);
            throw new Error(`Groq API error: ${groqResponse.status} ${groqResponse.statusText}`);
        }

        const data = await groqResponse.json();
        const aiResponse = data.choices[0].message.content;
        console.log('Groq API Response:', aiResponse);

        // Try to parse JSON response
        try {
            // Extract JSON from response if it's wrapped in markdown or other text
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;

            const evaluation = JSON.parse(jsonString);

            // Validate the response structure
            if (!evaluation.overall || !evaluation.feedback || !evaluation.strengths || !evaluation.improvements) {
                throw new Error('Invalid evaluation structure');
            }

            // Ensure score is within valid range
            evaluation.overall = Math.max(1.0, Math.min(5.0, parseFloat(evaluation.overall)));

            res.json(evaluation);
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            
            // Create a more accurate fallback based on the actual answer
            const answerLower = answer.toLowerCase();
            let fallbackScore = 1.5;
            let fallbackFeedback = "Unable to properly evaluate the response due to technical issues.";
            let fallbackStrengths = ["Attempted to provide a response"];
            let fallbackImprovements = ["Provide more detailed and relevant information", "Structure your answer more clearly"];

            if (answerLower.includes("i don't know") || answerLower.includes("i dont know") || answerLower === "no speech was detected in the response.") {
                fallbackScore = 1.2;
                fallbackFeedback = "The response indicates a lack of knowledge about the topic or no speech was detected. This is not suitable for an interview setting.";
                fallbackStrengths = ["Honest about knowledge gaps"];
                fallbackImprovements = ["Prepare better for the interview", "Research common interview questions", "Provide alternative approaches or related experience"];
            }

            res.json({
                overall: fallbackScore,
                feedback: fallbackFeedback,
                strengths: fallbackStrengths,
                improvements: fallbackImprovements
            });
        }

    } catch (error) {
        console.error('Evaluation error:', error);
        res.status(500).json({ 
            error: 'Failed to evaluate response',
            message: error.message 
        });
    }
});

// Catch-all for other API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        message: 'This API endpoint has not been implemented yet'
    });
});

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all handler for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 AI Interview Platform Server running on port ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔧 Health Check: http://localhost:${PORT}/health`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;