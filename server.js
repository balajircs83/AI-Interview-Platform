const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Add fetch polyfill for Node.js
if (!global.fetch) {
    global.fetch = require('node-fetch');
}

// Import database service
const DatabaseService = require('./services/database');

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
// Start a new interview session
app.post('/api/interview/start', async (req, res) => {
    try {
        const { userEmail, userName } = req.body;
        
        // Create or get user
        const userResult = await DatabaseService.createOrGetUser({
            email: userEmail || `anonymous_${Date.now()}@temp.com`,
            name: userName || 'Anonymous User'
        });

        if (!userResult.success) {
            return res.status(500).json({ error: 'Failed to create user', details: userResult.error });
        }

        // Create interview session
        const sessionResult = await DatabaseService.createInterviewSession(
            userResult.data.id,
            { 
                browser: req.get('User-Agent'),
                ip: req.ip,
                startTime: new Date().toISOString()
            }
        );

        if (!sessionResult.success) {
            return res.status(500).json({ error: 'Failed to create session', details: sessionResult.error });
        }

        res.json({
            success: true,
            sessionId: sessionResult.data.id,
            sessionToken: sessionResult.data.session_token,
            userId: userResult.data.id
        });
    } catch (error) {
        console.error('Error starting interview:', error);
        res.status(500).json({ error: 'Failed to start interview', message: error.message });
    }
});

// Save question response and get evaluation
app.post('/api/evaluate', async (req, res) => {
    try {
        const { 
            question, 
            answer, 
            sessionId, 
            questionIndex, 
            transcriptText, 
            audioDuration, 
            responseTime 
        } = req.body;
        
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
                model: "llama-3.3-70b-versatile",
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

            // Save to database if sessionId provided
            if (sessionId && questionIndex !== undefined) {
                await DatabaseService.saveQuestionResponse({
                    sessionId,
                    questionIndex,
                    questionText: question,
                    userAnswer: answer,
                    transcriptText,
                    audioDuration,
                    responseTime,
                    evaluationScore: evaluation.overall,
                    evaluationFeedback: evaluation.feedback,
                    evaluationStrengths: evaluation.strengths,
                    evaluationImprovements: evaluation.improvements
                });
            }

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

            const fallbackEvaluation = {
                overall: fallbackScore,
                feedback: fallbackFeedback,
                strengths: fallbackStrengths,
                improvements: fallbackImprovements
            };

            // Save fallback evaluation to database if sessionId provided
            if (sessionId && questionIndex !== undefined) {
                await DatabaseService.saveQuestionResponse({
                    sessionId,
                    questionIndex,
                    questionText: question,
                    userAnswer: answer,
                    transcriptText,
                    audioDuration,
                    responseTime,
                    evaluationScore: fallbackEvaluation.overall,
                    evaluationFeedback: fallbackEvaluation.feedback,
                    evaluationStrengths: fallbackEvaluation.strengths,
                    evaluationImprovements: fallbackEvaluation.improvements
                });
            }

            res.json(fallbackEvaluation);
        }

    } catch (error) {
        console.error('Evaluation error:', error);
        res.status(500).json({ 
            error: 'Failed to evaluate response',
            message: error.message 
        });
    }
});

// Complete interview session
app.post('/api/interview/complete', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }

        const result = await DatabaseService.completeInterviewSession(sessionId);
        
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to complete session', details: result.error });
        }

        res.json({ success: true, session: result.data });
    } catch (error) {
        console.error('Error completing interview:', error);
        res.status(500).json({ error: 'Failed to complete interview', message: error.message });
    }
});

// Get user performance
app.get('/api/user/:userId/performance', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await DatabaseService.getUserPerformance(userId);
        
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to get performance', details: result.error });
        }

        res.json({ success: true, performance: result.data });
    } catch (error) {
        console.error('Error getting user performance:', error);
        res.status(500).json({ error: 'Failed to get user performance', message: error.message });
    }
});

// Get user interview history
app.get('/api/user/:userId/history', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 10 } = req.query;
        
        const result = await DatabaseService.getUserInterviewHistory(userId, parseInt(limit));
        
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to get history', details: result.error });
        }

        res.json({ success: true, history: result.data });
    } catch (error) {
        console.error('Error getting user history:', error);
        res.status(500).json({ error: 'Failed to get user history', message: error.message });
    }
});

// Get session details
app.get('/api/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const sessionResult = await DatabaseService.getInterviewSession(sessionId);
        const responsesResult = await DatabaseService.getSessionResponses(sessionId);
        
        if (!sessionResult.success) {
            return res.status(404).json({ error: 'Session not found', details: sessionResult.error });
        }

        res.json({ 
            success: true, 
            session: sessionResult.data,
            responses: responsesResult.success ? responsesResult.data : []
        });
    } catch (error) {
        console.error('Error getting session details:', error);
        res.status(500).json({ error: 'Failed to get session details', message: error.message });
    }
});

// Get analytics dashboard data
app.get('/api/analytics/questions', async (req, res) => {
    try {
        const result = await DatabaseService.getQuestionAnalytics();
        
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to get analytics', details: result.error });
        }

        res.json({ success: true, analytics: result.data });
    } catch (error) {
        console.error('Error getting question analytics:', error);
        res.status(500).json({ error: 'Failed to get question analytics', message: error.message });
    }
});

// Record performance metric
app.post('/api/analytics/metric', async (req, res) => {
    try {
        const { userId, sessionId, metricName, metricValue, metricData } = req.body;
        
        if (!userId || !sessionId || !metricName || metricValue === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await DatabaseService.recordPerformanceMetric(
            userId, sessionId, metricName, metricValue, metricData
        );
        
        if (!result.success) {
            return res.status(500).json({ error: 'Failed to record metric', details: result.error });
        }

        res.json({ success: true, metric: result.data });
    } catch (error) {
        console.error('Error recording performance metric:', error);
        res.status(500).json({ error: 'Failed to record metric', message: error.message });
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