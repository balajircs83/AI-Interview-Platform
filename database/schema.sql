-- AI Interview Platform Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table to track interview participants
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_interviews INTEGER DEFAULT 0,
    average_score DECIMAL(3,2) DEFAULT 0.00
);

-- Interview sessions table
CREATE TABLE IF NOT EXISTS interview_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    total_questions INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    overall_score DECIMAL(3,2),
    session_metadata JSONB DEFAULT '{}'::jsonb
);

-- Individual question responses
CREATE TABLE IF NOT EXISTS question_responses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
    question_index INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    user_answer TEXT,
    transcript_text TEXT,
    audio_duration INTEGER, -- in seconds
    response_time INTEGER, -- time taken to answer in seconds
    evaluation_score DECIMAL(3,2),
    evaluation_feedback TEXT,
    evaluation_strengths JSONB DEFAULT '[]'::jsonb,
    evaluation_improvements JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, question_index)
);

-- Performance analytics table
CREATE TABLE IF NOT EXISTS performance_analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,4),
    metric_data JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_question_responses_session_id ON question_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_performance_analytics_user_id ON performance_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_analytics_session_id ON performance_analytics(session_id);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_analytics ENABLE ROW LEVEL SECURITY;

-- Policies for users table
CREATE POLICY "Users can view their own data" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own data" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Policies for interview_sessions table
CREATE POLICY "Users can view their own sessions" ON interview_sessions
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own sessions" ON interview_sessions
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own sessions" ON interview_sessions
    FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Policies for question_responses table
CREATE POLICY "Users can view their own responses" ON question_responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM interview_sessions 
            WHERE interview_sessions.id = question_responses.session_id 
            AND interview_sessions.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert their own responses" ON question_responses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM interview_sessions 
            WHERE interview_sessions.id = question_responses.session_id 
            AND interview_sessions.user_id::text = auth.uid()::text
        )
    );

-- Policies for performance_analytics table
CREATE POLICY "Users can view their own analytics" ON performance_analytics
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own analytics" ON performance_analytics
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Functions for updating user statistics
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user's total interviews and average score
    UPDATE users 
    SET 
        total_interviews = (
            SELECT COUNT(*) 
            FROM interview_sessions 
            WHERE user_id = NEW.user_id AND status = 'completed'
        ),
        average_score = (
            SELECT COALESCE(AVG(overall_score), 0) 
            FROM interview_sessions 
            WHERE user_id = NEW.user_id AND status = 'completed' AND overall_score IS NOT NULL
        ),
        updated_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update user stats when interview is completed
CREATE TRIGGER update_user_stats_trigger
    AFTER UPDATE OF status ON interview_sessions
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
    EXECUTE FUNCTION update_user_stats();

-- Function to calculate session overall score
CREATE OR REPLACE FUNCTION calculate_session_score()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate overall score based on question responses
    UPDATE interview_sessions 
    SET overall_score = (
        SELECT COALESCE(AVG(evaluation_score), 0)
        FROM question_responses 
        WHERE session_id = NEW.session_id AND evaluation_score IS NOT NULL
    )
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session score when responses are added/updated
CREATE TRIGGER calculate_session_score_trigger
    AFTER INSERT OR UPDATE OF evaluation_score ON question_responses
    FOR EACH ROW
    EXECUTE FUNCTION calculate_session_score();

-- Views for analytics
CREATE OR REPLACE VIEW user_performance_summary AS
SELECT 
    u.id,
    u.name,
    u.email,
    u.total_interviews,
    u.average_score,
    COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_interviews,
    COUNT(CASE WHEN s.status = 'abandoned' THEN 1 END) as abandoned_interviews,
    AVG(CASE WHEN s.status = 'completed' THEN s.overall_score END) as calculated_avg_score,
    MAX(s.completed_at) as last_interview_date
FROM users u
LEFT JOIN interview_sessions s ON u.id = s.user_id
GROUP BY u.id, u.name, u.email, u.total_interviews, u.average_score;

-- View for question performance analytics
CREATE OR REPLACE VIEW question_performance_analytics AS
SELECT 
    qr.question_text,
    COUNT(*) as total_responses,
    AVG(qr.evaluation_score) as average_score,
    AVG(qr.response_time) as average_response_time,
    AVG(qr.audio_duration) as average_audio_duration,
    COUNT(CASE WHEN qr.evaluation_score >= 4.0 THEN 1 END) as high_scores,
    COUNT(CASE WHEN qr.evaluation_score < 2.0 THEN 1 END) as low_scores
FROM question_responses qr
WHERE qr.evaluation_score IS NOT NULL
GROUP BY qr.question_text
ORDER BY average_score DESC;