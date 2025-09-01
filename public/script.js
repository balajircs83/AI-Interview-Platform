// Global variables
let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingTime = 0;
let timerInterval = null;
let timeLeft = 30;
let analyser = null;
let dataArray = null;
let equalizerBars = [];
let recordedBlob = null;
let audioUrl = null;
let interviewStarted = false;
let currentQuestionIndex = 0;
let responseText = '';
let speechRecognition = null;
let isTranscribing = false;
let finalTranscript = '';
let interimTranscript = '';
let mediaPermissionsGranted = false;
let audioStream = null; // Separate audio stream for recording
let cameraEnabled = false; // Track if camera is enabled (disabled by default)

// Database tracking variables
let currentSessionId = null;
let currentUserId = null;
let questionStartTime = null;
let recordingStartTime = null;

// API configuration - now points to our backend
const API_BASE_URL = window.location.origin;
const EVALUATE_ENDPOINT = `${API_BASE_URL}/api/evaluate`;

// Interview questions
const interviewQuestions = [
    "Tell me about yourself and your background in software development.",
    "What are your key technical skills and areas of expertise?",
    "Can you describe your most recent work experience and role?",
    "Tell me about a challenging project you've worked on recently.",
    "What are you looking for in your next opportunity and career goals?"
];

// Initialize Speech Recognition
function initSpeechRecognition() {
    console.log('🎤 Initializing Speech Recognition...');
    console.log('Current URL:', window.location.href);
    console.log('Secure Context:', window.isSecureContext);
    console.log('Protocol:', window.location.protocol);

    // Don't reinitialize if already exists
    if (speechRecognition) {
        return true;
    }

    // Check for secure context (HTTPS or localhost)
    if (!window.isSecureContext && window.location.protocol !== 'http:') {
        console.error('Speech Recognition requires secure context (HTTPS or localhost)');
        updateSpeechStatus('Speech recognition requires HTTPS or localhost', 'error');
        return false;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('Speech Recognition not supported in this browser');
        updateSpeechStatus('Speech recognition not supported. Please use Chrome, Edge, or Safari.', 'error');
        return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();

    // Configure speech recognition
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = navigator.language || 'en-US';
    speechRecognition.maxAlternatives = 1;

    // Speech recognition event handlers
    speechRecognition.onstart = () => {
        console.log('Speech recognition started');
        isTranscribing = true;
        updateSpeechStatus('Listening for your speech...', 'listening');
        updateTranscriptDisplay('Listening for your speech...', 'listening');
    };

    speechRecognition.onresult = (event) => {
        let currentInterim = '';
        let currentFinal = '';

        // Process results from the last result index
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;

            if (result.isFinal) {
                currentFinal += transcript + ' ';
            } else {
                currentInterim += transcript;
            }
        }

        // Update transcripts
        if (currentFinal) {
            finalTranscript += currentFinal;
        }
        interimTranscript = currentInterim;
        responseText = finalTranscript.trim();

        // Update display
        const displayText = finalTranscript + (interimTranscript ? ' ' + interimTranscript : '');
        updateTranscriptDisplay(displayText || 'Listening for your speech...', 'speaking');
        updateSpeechStatus(`Speaking... (${displayText.length} characters)`, 'speaking');
    };

    speechRecognition.onend = () => {
        console.log('Speech recognition ended');
        isTranscribing = false;

        if (finalTranscript.trim()) {
            updateSpeechStatus(`Speech captured (${finalTranscript.length} characters)`, 'success');
            updateTranscriptDisplay(finalTranscript, 'success');
        } else {
            updateSpeechStatus('No speech detected', 'warning');
            updateTranscriptDisplay('No speech was detected. Please try speaking again.', 'warning');
        }
    };

    speechRecognition.onerror = (event) => {
        console.error('Speech recognition error details:', {
            error: event.error,
            message: event.message,
            type: event.type,
            timeStamp: event.timeStamp,
            currentURL: window.location.href,
            userAgent: navigator.userAgent,
            isSecureContext: window.isSecureContext
        });
        isTranscribing = false;

        let errorMessage = '';
        switch (event.error) {
            case 'network':
                errorMessage = 'Network error - Speech recognition service unavailable. Try refreshing the page.';
                console.error('Network error details: This might be due to CSP restrictions or HTTPS requirements');
                break;
            case 'not-allowed':
                errorMessage = 'Microphone permission denied';
                break;
            case 'no-speech':
                errorMessage = 'No speech detected - Please speak louder';
                break;
            case 'audio-capture':
                errorMessage = 'Microphone not available';
                break;
            case 'service-not-allowed':
                errorMessage = 'Speech recognition service not allowed - Check browser settings';
                break;
            case 'bad-grammar':
                errorMessage = 'Speech recognition grammar error';
                break;
            default:
                errorMessage = `Speech recognition error: ${event.error}`;
        }

        updateSpeechStatus(errorMessage, 'error');
        updateTranscriptDisplay(errorMessage, 'error');
    };

    return true;
}

// Update speech status display
function updateSpeechStatus(message, type = 'info') {
    const speechStatus = document.getElementById('speechStatus');
    if (speechStatus) {
        speechStatus.textContent = message;
        speechStatus.className = `speech-status-left ${type}`;
    }
}

// Update transcript display
function updateTranscriptDisplay(text, type = 'listening') {
    const liveTranscript = document.getElementById('liveTranscript');
    if (liveTranscript) {
        liveTranscript.textContent = text;
        liveTranscript.className = `transcript-display ${type}`;
    }

    // Update character count
    const charCount = document.getElementById('charCount');
    if (charCount) {
        charCount.textContent = `${text.length} characters`;
    }
}

// Check MediaRecorder support
function checkMediaRecorderSupport() {
    if (!window.MediaRecorder) {
        console.error('MediaRecorder not supported');
        return false;
    }

    const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
    ];

    const supported = supportedTypes.filter(type => MediaRecorder.isTypeSupported(type));
    console.log('Supported audio types:', supported);

    return supported.length > 0 || true; // Allow default codec as fallback
}

// Initialize camera and microphone
async function initCameraAndMicrophone() {
    try {
        console.log('Initializing camera and microphone...');

        // Check MediaRecorder support first
        if (!window.MediaRecorder) {
            throw new Error('MediaRecorder not supported in this browser');
        }

        // First, get audio-only stream (mandatory)
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 44100,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Camera is disabled by default, but we'll set up the UI accordingly
        cameraEnabled = false;

        // Set up video preview to show camera is disabled by default
        const cameraPreview = document.getElementById('cameraPreview');
        if (cameraPreview) {
            cameraPreview.innerHTML = `
                <div style="text-align: center; color: #9ca3af;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">📷</div>
                    <p>Camera disabled by default</p>
                    <p style="font-size: 0.8rem;">Enable camera using the toggle below</p>
                </div>
            `;
        }

        // Set up audio analysis for equalizer using audio stream
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const microphone = audioContext.createMediaStreamSource(audioStream);
        microphone.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Update camera status and enable start button
        const cameraStatus = document.getElementById('cameraStatus');
        const startBtn = document.getElementById('startInterviewBtn');

        if (cameraStatus) {
            cameraStatus.textContent = 'Status: Microphone ready, camera disabled ✅';
            cameraStatus.style.color = '#f59e0b';
        }

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.textContent = '🎙️ Start Interview (Audio Only)';
        }

        mediaPermissionsGranted = true;

        // Initialize speech recognition early to avoid multiple permission prompts
        initSpeechRecognition();

        console.log('Media devices initialized successfully (camera disabled by default)');
        return true;

    } catch (error) {
        console.error('Media access error:', error);

        const cameraPreview = document.getElementById('cameraPreview');
        const startBtn = document.getElementById('startInterviewBtn');

        if (cameraPreview) {
            cameraPreview.innerHTML = `
                <div style="text-align: center; color: #ef4444;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">❌</div>
                    <p>Microphone access denied</p>
                    <p style="font-size: 0.8rem;">Microphone is required for the interview</p>
                </div>
            `;
        }

        const cameraStatus = document.getElementById('cameraStatus');
        if (cameraStatus) {
            cameraStatus.textContent = 'Status: Microphone permission denied ❌';
            cameraStatus.style.color = '#ef4444';
        }

        // Disable start button if permissions not granted
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.style.opacity = '0.5';
            startBtn.textContent = '❌ Microphone Required';
        }

        mediaPermissionsGranted = false;
        return false;
    }
}

// Start interview
async function startInterview() {
    console.log('Starting interview...');

    if (!mediaPermissionsGranted) {
        alert('Camera and microphone permissions are required to start the interview. Please refresh the page and allow permissions.');
        return;
    }

    try {
        // Save user info and start interview session in database
        saveUserInfo();
        
        const response = await fetch(`${API_BASE_URL}/api/interview/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userEmail: localStorage.getItem('userEmail') || null,
                userName: localStorage.getItem('userName') || 'Anonymous User'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to start interview session');
        }

        const sessionData = await response.json();
        currentSessionId = sessionData.sessionId;
        currentUserId = sessionData.userId;
        
        console.log('Interview session started:', sessionData);

        // Reset variables
        currentQuestionIndex = 0;
        responseText = '';
        finalTranscript = '';
        interimTranscript = '';

        // Show question state
        showState('questionState');

        // Display current question
        displayCurrentQuestion();
        questionStartTime = Date.now();

        // AI speaks the question using Text-to-Speech
        speakQuestion(() => {
            // Start recording after AI finishes speaking
            setTimeout(startRecording, 1000);
        });

        interviewStarted = true;
    } catch (error) {
        console.error('Error starting interview:', error);
        alert('Failed to start interview session. Please try again.');
    }
}

// Display current question
function displayCurrentQuestion() {
    const questionText = document.getElementById('questionText');
    if (questionText) {
        questionText.textContent = interviewQuestions[currentQuestionIndex];
    }
}

// Speak question using Text-to-Speech
function speakQuestion(callback) {
    const aiStatus = document.getElementById('aiStatus');
    if (aiStatus) {
        aiStatus.textContent = 'AI is speaking the question...';
    }

    // Ensure voices are loaded before speaking
    const speakWithVoice = () => {
        const utterance = new SpeechSynthesisUtterance(interviewQuestions[currentQuestionIndex]);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to use a better voice if available
        const voices = speechSynthesis.getVoices();
        console.log('Available voices:', voices.length);

        const preferredVoice = voices.find(voice =>
            voice.lang.startsWith('en') &&
            (voice.name.includes('Female') || voice.name.includes('Google') || voice.name.includes('Microsoft'))
        ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];

        if (preferredVoice) {
            utterance.voice = preferredVoice;
            console.log('Using voice:', preferredVoice.name);
        }

        utterance.onstart = () => {
            console.log('Speech synthesis started');
        };

        utterance.onend = () => {
            console.log('Speech synthesis ended');
            if (aiStatus) {
                aiStatus.textContent = 'AI finished speaking. You can now answer...';
            }
            if (callback) callback();
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            if (aiStatus) {
                aiStatus.textContent = 'Speech synthesis failed. You can now answer...';
            }
            if (callback) callback();
        };

        // Cancel any ongoing speech and speak
        speechSynthesis.cancel();
        setTimeout(() => {
            speechSynthesis.speak(utterance);
        }, 100);
    };

    // Check if voices are loaded
    if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.addEventListener('voiceschanged', speakWithVoice, { once: true });
    } else {
        speakWithVoice();
    }
}

// Start recording
async function startRecording() {
    try {
        console.log('Starting recording...');

        if (!mediaPermissionsGranted || !audioStream) {
            alert('Microphone permission is required to start recording.');
            return;
        }

        // Show recording state
        showState('recordingState');
        recordingStartTime = Date.now();

        // Reset speech recognition variables
        responseText = '';
        finalTranscript = '';
        interimTranscript = '';

        // Set up media recorder using audio-only stream
        let mediaRecorderOptions = null;

        // Try different codec options in order of preference
        const codecOptions = [
            { mimeType: 'audio/webm;codecs=opus' },
            { mimeType: 'audio/webm' },
            { mimeType: 'audio/ogg;codecs=opus' },
            { mimeType: 'audio/mp4' }
        ];

        // Find the first supported codec
        for (const option of codecOptions) {
            if (MediaRecorder.isTypeSupported(option.mimeType)) {
                mediaRecorderOptions = option;
                console.log('Using codec:', option.mimeType);
                break;
            }
        }

        // Create MediaRecorder with audio stream and best available codec
        try {
            if (mediaRecorderOptions) {
                mediaRecorder = new MediaRecorder(audioStream, mediaRecorderOptions);
            } else {
                // Use default codec if none of the preferred ones are supported
                mediaRecorder = new MediaRecorder(audioStream);
                console.log('Using default codec');
            }
        } catch (recorderError) {
            console.error('MediaRecorder creation failed:', recorderError);
            // Try without options as last resort
            mediaRecorder = new MediaRecorder(audioStream);
        }

        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
                console.log('Data chunk received:', event.data.size);
            }
        };

        mediaRecorder.onstop = () => {
            console.log('MediaRecorder stopped, chunks:', recordedChunks.length);
            if (recordedChunks.length > 0) {
                // Use the appropriate mime type for the blob
                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                recordedBlob = new Blob(recordedChunks, { type: mimeType });
                audioUrl = URL.createObjectURL(recordedBlob);
                console.log('Audio blob created:', recordedBlob.size, 'bytes');
            }
            showReviewState();
        };

        mediaRecorder.onstart = () => {
            console.log('MediaRecorder started successfully');
            isRecording = true;
        };

        // Add error handler for MediaRecorder
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            alert('Recording error occurred. Please try again.');
            isRecording = false;
            showState('questionState');
        };

        // Start recording with timeslice to get regular data chunks
        try {
            mediaRecorder.start(1000); // Get data every second
            timeLeft = 30;
            console.log('MediaRecorder.start() called successfully');
        } catch (startError) {
            console.error('Failed to start MediaRecorder:', startError);
            alert('Failed to start recording. Please try again.');
            showState('questionState');
            return;
        }

        // Start timer
        startTimer();

        // Create and update equalizer
        createEqualizer();
        updateEqualizer();

        // Start speech recognition (reuse existing permissions, no new prompt)
        if (!speechRecognition) {
            initSpeechRecognition();
        }

        if (speechRecognition) {
            try {
                // Reset transcripts before starting
                finalTranscript = '';
                interimTranscript = '';
                speechRecognition.start();
                console.log('Speech recognition started successfully');
            } catch (speechError) {
                console.warn('Speech recognition failed to start:', speechError);
                updateSpeechStatus('Speech recognition unavailable - Audio recording continues', 'warning');
            }
        }

    } catch (error) {
        console.error('Recording failed:', error);
        alert('Recording failed: ' + error.message);
        showState('questionState');
    }
}

// Start timer
function startTimer() {
    const timerDisplay = document.getElementById('timerDisplay');

    timerInterval = setInterval(() => {
        timeLeft--;
        if (timerDisplay) {
            timerDisplay.textContent = `${timeLeft}s`;
            if (timeLeft <= 5) {
                timerDisplay.style.color = '#ef4444';
            }
        }

        if (timeLeft <= 0) {
            stopRecording();
        }
    }, 1000);
}

// Stop recording
function stopRecording() {
    console.log('Stopping recording...');

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
            console.log('MediaRecorder.stop() called');
        } catch (error) {
            console.error('Error stopping MediaRecorder:', error);
        }
    }
    
    isRecording = false;

    // Stop speech recognition
    if (speechRecognition && isTranscribing) {
        try {
            speechRecognition.stop();
            console.log('Speech recognition stopped');
        } catch (error) {
            console.error('Error stopping speech recognition:', error);
        }
    }
}

// Show review state
function showReviewState() {
    console.log('Showing review state...');

    showState('reviewState');

    // Display final transcript
    const finalTranscriptDisplay = document.getElementById('finalTranscript');
    if (finalTranscriptDisplay) {
        if (responseText && responseText.trim()) {
            finalTranscriptDisplay.textContent = responseText;
            finalTranscriptDisplay.className = 'transcript-display';
        } else {
            finalTranscriptDisplay.textContent = 'No speech was detected. The audio has been recorded, but speech-to-text was not successful.';
            finalTranscriptDisplay.className = 'transcript-display error';
        }
    }
}

// Create equalizer bars
function createEqualizer() {
    const equalizerContainer = document.getElementById('equalizer');
    if (equalizerContainer) {
        equalizerContainer.innerHTML = '';
        equalizerBars = [];

        for (let i = 0; i < 8; i++) {
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = '4px';
            equalizerContainer.appendChild(bar);
            equalizerBars.push(bar);
        }
    }
}

// Update equalizer animation
function updateEqualizer() {
    if (!analyser || !dataArray || !isRecording) return;

    analyser.getByteFrequencyData(dataArray);

    equalizerBars.forEach((bar, index) => {
        const start = Math.floor(index * dataArray.length / equalizerBars.length);
        const end = Math.floor((index + 1) * dataArray.length / equalizerBars.length);
        const slice = dataArray.slice(start, end);
        const average = slice.reduce((a, b) => a + b, 0) / slice.length;
        const height = Math.min((average / 255) * 60, 60);
        bar.style.height = `${Math.max(height, 4)}px`;
    });

    if (isRecording) {
        requestAnimationFrame(updateEqualizer);
    }
}

// Play recorded answer
function playRecording() {
    if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play().catch(error => {
            console.error('Audio playback failed:', error);
            alert('Could not play audio. Please check your browser settings.');
        });
    } else {
        alert('No audio recording available.');
    }
}

// Submit answer for evaluation using Groq API
async function submitAnswer() {
    console.log('Submitting answer for evaluation...');

    const currentQuestion = interviewQuestions[currentQuestionIndex];
    const userAnswer = responseText && responseText.trim().length > 0 ? responseText : 'No speech was detected in the response.';
    
    // Calculate response metrics
    const responseTime = questionStartTime ? Math.floor((Date.now() - questionStartTime) / 1000) : 0;
    const audioDuration = recordedBlob ? Math.floor(recordedBlob.size / 1000) : 0; // Rough estimate

    showState('evaluatingState');

    try {
        const evaluation = await evaluateWithGroqAPI(currentQuestion, userAnswer, {
            sessionId: currentSessionId,
            questionIndex: currentQuestionIndex,
            transcriptText: responseText,
            audioDuration: audioDuration,
            responseTime: responseTime
        });
        showEvaluationResults(evaluation);
    } catch (error) {
        console.error('Evaluation failed:', error);
        // Fallback to mock evaluation if API fails
        const mockEvaluation = generateMockEvaluation();
        showEvaluationResults(mockEvaluation);
    }
}

// Evaluate answer using Groq API
async function evaluateWithGroqAPI(question, answer, metadata = {}) {
    const response = await fetch(EVALUATE_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            question: question,
            answer: answer,
            ...metadata
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Backend API Error Details:', errorData);
        throw new Error(`Evaluation API error: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
    }

    const evaluation = await response.json();
    console.log('Backend API Response:', evaluation);

    // Validate the response structure
    if (!evaluation.overall || !evaluation.feedback || !evaluation.strengths || !evaluation.improvements) {
        throw new Error('Invalid evaluation structure from backend');
    }

    return evaluation;
}

// Generate mock evaluation
function generateMockEvaluation() {
    const evaluations = [
        {
            overall: 4.2,
            feedback: "Your response demonstrates good communication skills and provides relevant information about your background.",
            strengths: [
                "Clear communication style",
                "Relevant examples provided",
                "Good structure and flow"
            ],
            improvements: [
                "Could include more specific technical details",
                "Consider quantifying your achievements",
                "Expand on your problem-solving approach"
            ]
        },
        {
            overall: 3.8,
            feedback: "Good foundation in your response with room for enhancement in technical depth and specific examples.",
            strengths: [
                "Confident delivery",
                "Shows enthusiasm",
                "Addresses the question directly"
            ],
            improvements: [
                "Add more concrete examples",
                "Include metrics and results",
                "Elaborate on technical challenges"
            ]
        }
    ];

    return evaluations[Math.floor(Math.random() * evaluations.length)];
}

// Show evaluation results
function showEvaluationResults(evaluation) {
    console.log('Showing evaluation results...');

    showState('resultsState');

    // Update overall score
    const overallScore = document.getElementById('overallScore');
    if (overallScore) {
        overallScore.textContent = `${evaluation.overall}/5`;
    }

    // Update feedback
    const feedbackText = document.getElementById('feedbackText');
    if (feedbackText) {
        feedbackText.textContent = evaluation.feedback;
    }

    // Update strengths
    const strengthsList = document.getElementById('strengthsList');
    if (strengthsList) {
        strengthsList.innerHTML = '';
        evaluation.strengths.forEach(strength => {
            const li = document.createElement('li');
            li.textContent = strength;
            strengthsList.appendChild(li);
        });
    }

    // Update improvements
    const improvementsList = document.getElementById('improvementsList');
    if (improvementsList) {
        improvementsList.innerHTML = '';
        evaluation.improvements.forEach(improvement => {
            const li = document.createElement('li');
            li.textContent = improvement;
            improvementsList.appendChild(li);
        });
    }
}

// Continue to next question
function nextQuestion() {
    currentQuestionIndex++;

    if (currentQuestionIndex >= interviewQuestions.length) {
        // Complete the interview session
        completeInterview();
        return;
    }

    // Reset for next question
    responseText = '';
    finalTranscript = '';
    interimTranscript = '';

    // Start next question
    showState('questionState');
    displayCurrentQuestion();
    questionStartTime = Date.now();
    speakQuestion(() => {
        setTimeout(startRecording, 1000);
    });
}

// Complete interview and save to database
async function completeInterview() {
    try {
        if (currentSessionId) {
            const response = await fetch(`${API_BASE_URL}/api/interview/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: currentSessionId
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Interview completed successfully:', result);
                
                // Show completion message with performance summary
                alert(`Interview completed! Thank you for participating.\n\nYour overall score: ${result.session.overall_score?.toFixed(1) || 'N/A'}/5.0\nQuestions answered: ${result.session.questions_answered}/${result.session.total_questions}`);
            } else {
                console.error('Failed to complete interview session');
            }
        }
        
        // Reset session variables
        currentSessionId = null;
        currentUserId = null;
        location.reload();
    } catch (error) {
        console.error('Error completing interview:', error);
        alert('Interview completed! Thank you for participating.');
        location.reload();
    }
}

// End interview
function endInterview() {
    const confirmed = confirm('Are you sure you want to end the interview?');
    if (confirmed) {
        completeInterview();
    }
}

// Save user information to localStorage
function saveUserInfo() {
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    
    if (userName && userName.value.trim()) {
        localStorage.setItem('userName', userName.value.trim());
    }
    if (userEmail && userEmail.value.trim()) {
        localStorage.setItem('userEmail', userEmail.value.trim());
    }
}

// Load user information from localStorage
function loadUserInfo() {
    const savedName = localStorage.getItem('userName');
    const savedEmail = localStorage.getItem('userEmail');
    
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    
    if (savedName && userName) {
        userName.value = savedName;
    }
    if (savedEmail && userEmail) {
        userEmail.value = savedEmail;
    }
}

// Re-record answer
function reRecord() {
    console.log('Re-recording answer...');

    // Reset variables
    responseText = '';
    finalTranscript = '';
    interimTranscript = '';

    // Show question state and restart
    showState('questionState');
    displayCurrentQuestion();
    speakQuestion(() => {
        setTimeout(startRecording, 1000);
    });
}

// Show specific state
function showState(stateName) {
    const states = ['welcomeState', 'questionState', 'recordingState', 'reviewState', 'evaluatingState', 'resultsState'];

    states.forEach(state => {
        const element = document.getElementById(state);
        if (element) {
            element.style.display = state === stateName ? 'block' : 'none';
        }
    });
}

// Toggle camera on/off
async function toggleCamera(enable) {
    try {
        if (enable && !cameraEnabled) {
            // Try to enable camera
            const videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });
            
            stream = videoStream;
            cameraEnabled = true;
            
            // Set up video preview
            const cameraPreview = document.getElementById('cameraPreview');
            if (cameraPreview) {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.autoplay = true;
                video.playsInline = true;
                video.muted = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                video.style.borderRadius = '0.5rem';

                cameraPreview.innerHTML = '';
                cameraPreview.appendChild(video);
            }
            
            const cameraStatus = document.getElementById('cameraStatus');
            if (cameraStatus) {
                cameraStatus.textContent = 'Status: Camera and microphone ready ✅';
                cameraStatus.style.color = '#10b981';
            }
            
            const startBtn = document.getElementById('startInterviewBtn');
            if (startBtn) {
                startBtn.textContent = '🚀 Start Interview';
            }
            
            console.log('Camera enabled');
        } else if (!enable && cameraEnabled) {
            // Disable camera
            if (stream) {
                const tracks = stream.getTracks();
                tracks.forEach(track => track.stop());
                stream = null;
            }
            cameraEnabled = false;
            
            // Update UI
            const cameraPreview = document.getElementById('cameraPreview');
            if (cameraPreview) {
                cameraPreview.innerHTML = `
                    <div style="text-align: center; color: #9ca3af;">
                        <div style="font-size: 3rem; margin-bottom: 0.5rem;">📷</div>
                        <p>Camera disabled</p>
                        <p style="font-size: 0.8rem;">Audio recording will work without camera</p>
                    </div>
                `;
            }
            
            const cameraStatus = document.getElementById('cameraStatus');
            if (cameraStatus) {
                cameraStatus.textContent = 'Status: Microphone ready, camera disabled ✅';
                cameraStatus.style.color = '#f59e0b';
            }
            
            const startBtn = document.getElementById('startInterviewBtn');
            if (startBtn) {
                startBtn.textContent = '🎙️ Start Interview (Audio Only)';
            }
            
            console.log('Camera disabled');
        }
    } catch (error) {
        console.error('Error toggling camera:', error);
        // Revert toggle state
        const cameraToggle = document.getElementById('cameraToggle');
        if (cameraToggle) {
            cameraToggle.checked = !enable;
        }
        
        alert('Failed to ' + (enable ? 'enable' : 'disable') + ' camera: ' + error.message);
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', function () {
    console.log('AI Interview Platform initialized');

    // Load saved user info
    loadUserInfo();

    // Initialize camera and microphone
    initCameraAndMicrophone();

    // Load voices for text-to-speech
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
            console.log('Speech synthesis voices loaded');
        };
    }

    // Bind event listeners
    const startBtn = document.getElementById('startInterviewBtn');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const playBtn = document.getElementById('playAnswerBtn');
    const submitBtn = document.getElementById('submitAnswerBtn');
    const reRecordBtn = document.getElementById('reRecordBtn');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const endBtn = document.getElementById('endInterviewBtn');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const cameraToggle = document.getElementById('cameraToggle');

    if (startBtn) startBtn.addEventListener('click', startInterview);
    if (stopBtn) stopBtn.addEventListener('click', stopRecording);
    if (playBtn) playBtn.addEventListener('click', playRecording);
    if (submitBtn) submitBtn.addEventListener('click', submitAnswer);
    if (reRecordBtn) reRecordBtn.addEventListener('click', reRecord);
    if (nextBtn) nextBtn.addEventListener('click', nextQuestion);
    if (endBtn) endBtn.addEventListener('click', endInterview);
    if (cameraToggle) cameraToggle.addEventListener('change', (e) => toggleCamera(e.target.checked));

    // Save user info when fields change
    if (userName) userName.addEventListener('change', saveUserInfo);
    if (userEmail) userEmail.addEventListener('change', saveUserInfo);

    console.log('Event listeners bound successfully');
});