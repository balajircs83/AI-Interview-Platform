const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

class DatabaseService {
    // User Management
    async createOrGetUser(userData) {
        try {
            const { email, name } = userData;
            
            // Try to find existing user
            let { data: user, error } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', email)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw error;
            }

            // Create user if doesn't exist
            if (!user) {
                const { data: newUser, error: createError } = await supabaseAdmin
                    .from('users')
                    .insert([{
                        email,
                        name: name || 'Anonymous User'
                    }])
                    .select()
                    .single();

                if (createError) throw createError;
                user = newUser;
            }

            return { success: true, data: user };
        } catch (error) {
            console.error('Error creating/getting user:', error);
            return { success: false, error: error.message };
        }
    }

    // Interview Session Management
    async createInterviewSession(userId, sessionData = {}) {
        try {
            const sessionToken = uuidv4();
            
            const { data: session, error } = await supabaseAdmin
                .from('interview_sessions')
                .insert([{
                    user_id: userId,
                    session_token: sessionToken,
                    status: 'in_progress',
                    session_metadata: sessionData
                }])
                .select()
                .single();

            if (error) throw error;
            return { success: true, data: session };
        } catch (error) {
            console.error('Error creating interview session:', error);
            return { success: false, error: error.message };
        }
    }

    async updateInterviewSession(sessionId, updates) {
        try {
            const { data: session, error } = await supabaseAdmin
                .from('interview_sessions')
                .update(updates)
                .eq('id', sessionId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data: session };
        } catch (error) {
            console.error('Error updating interview session:', error);
            return { success: false, error: error.message };
        }
    }

    async getInterviewSession(sessionId) {
        try {
            const { data: session, error } = await supabaseAdmin
                .from('interview_sessions')
                .select(`
                    *,
                    users (
                        id,
                        name,
                        email
                    )
                `)
                .eq('id', sessionId)
                .single();

            if (error) throw error;
            return { success: true, data: session };
        } catch (error) {
            console.error('Error getting interview session:', error);
            return { success: false, error: error.message };
        }
    }

    // Question Response Management
    async saveQuestionResponse(responseData) {
        try {
            const {
                sessionId,
                questionIndex,
                questionText,
                userAnswer,
                transcriptText,
                audioDuration,
                responseTime,
                evaluationScore,
                evaluationFeedback,
                evaluationStrengths,
                evaluationImprovements
            } = responseData;

            const { data: response, error } = await supabaseAdmin
                .from('question_responses')
                .upsert([{
                    session_id: sessionId,
                    question_index: questionIndex,
                    question_text: questionText,
                    user_answer: userAnswer,
                    transcript_text: transcriptText,
                    audio_duration: audioDuration,
                    response_time: responseTime,
                    evaluation_score: evaluationScore,
                    evaluation_feedback: evaluationFeedback,
                    evaluation_strengths: evaluationStrengths,
                    evaluation_improvements: evaluationImprovements
                }], {
                    onConflict: 'session_id,question_index'
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data: response };
        } catch (error) {
            console.error('Error saving question response:', error);
            return { success: false, error: error.message };
        }
    }

    async getSessionResponses(sessionId) {
        try {
            const { data: responses, error } = await supabaseAdmin
                .from('question_responses')
                .select('*')
                .eq('session_id', sessionId)
                .order('question_index');

            if (error) throw error;
            return { success: true, data: responses };
        } catch (error) {
            console.error('Error getting session responses:', error);
            return { success: false, error: error.message };
        }
    }

    // Analytics and Performance Tracking
    async recordPerformanceMetric(userId, sessionId, metricName, metricValue, metricData = {}) {
        try {
            const { data: metric, error } = await supabaseAdmin
                .from('performance_analytics')
                .insert([{
                    user_id: userId,
                    session_id: sessionId,
                    metric_name: metricName,
                    metric_value: metricValue,
                    metric_data: metricData
                }])
                .select()
                .single();

            if (error) throw error;
            return { success: true, data: metric };
        } catch (error) {
            console.error('Error recording performance metric:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserPerformance(userId) {
        try {
            const { data: performance, error } = await supabaseAdmin
                .from('user_performance_summary')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            return { success: true, data: performance };
        } catch (error) {
            console.error('Error getting user performance:', error);
            return { success: false, error: error.message };
        }
    }

    async getQuestionAnalytics() {
        try {
            const { data: analytics, error } = await supabaseAdmin
                .from('question_performance_analytics')
                .select('*');

            if (error) throw error;
            return { success: true, data: analytics };
        } catch (error) {
            console.error('Error getting question analytics:', error);
            return { success: false, error: error.message };
        }
    }

    // Complete Interview Session
    async completeInterviewSession(sessionId) {
        try {
            // Get session responses to calculate final metrics
            const responsesResult = await this.getSessionResponses(sessionId);
            if (!responsesResult.success) {
                throw new Error('Failed to get session responses');
            }

            const responses = responsesResult.data;
            const totalQuestions = responses.length;
            const questionsAnswered = responses.filter(r => r.user_answer && r.user_answer.trim()).length;
            const overallScore = responses.length > 0 
                ? responses.reduce((sum, r) => sum + (r.evaluation_score || 0), 0) / responses.length 
                : 0;

            // Update session as completed
            const updateResult = await this.updateInterviewSession(sessionId, {
                status: 'completed',
                completed_at: new Date().toISOString(),
                total_questions: totalQuestions,
                questions_answered: questionsAnswered,
                overall_score: overallScore
            });

            if (!updateResult.success) {
                throw new Error('Failed to update session status');
            }

            return { success: true, data: updateResult.data };
        } catch (error) {
            console.error('Error completing interview session:', error);
            return { success: false, error: error.message };
        }
    }

    // Get User Interview History
    async getUserInterviewHistory(userId, limit = 10) {
        try {
            const { data: sessions, error } = await supabaseAdmin
                .from('interview_sessions')
                .select(`
                    *,
                    question_responses (
                        id,
                        question_index,
                        evaluation_score,
                        created_at
                    )
                `)
                .eq('user_id', userId)
                .order('started_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return { success: true, data: sessions };
        } catch (error) {
            console.error('Error getting user interview history:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new DatabaseService();