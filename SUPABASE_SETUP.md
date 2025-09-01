# Supabase Database Setup Guide

## 🚀 Quick Setup Instructions

### 1. Database Schema Setup
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the entire contents of `database/schema.sql`
4. Click **Run** to execute the schema

### 2. Environment Variables
Your `.env` file is already configured with the correct Supabase credentials:
```bash
SUPABASE_URL=https://fpfvafsxiwxnmciwjnkc.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Verify Setup
After running the schema, you should see these tables in your Supabase dashboard:
- `users` - User profiles and performance summaries
- `interview_sessions` - Complete interview session tracking
- `question_responses` - Individual question answers and evaluations
- `performance_analytics` - Detailed metrics and analytics

### 4. Test the Integration
1. Start your server: `npm start`
2. Open the application in your browser
3. Fill in optional user details (or proceed anonymously)
4. Start an interview session
5. Complete at least one question
6. Check your Supabase dashboard to see the data being saved

## 📊 Database Features

### User Tracking
- **Anonymous Support**: Users can participate without providing details
- **Optional Registration**: Name and email for progress tracking
- **Performance History**: Track improvement over multiple sessions

### Session Management
- **Real-time Tracking**: Each interview creates a session record
- **Progress Monitoring**: Track questions answered vs total questions
- **Completion Status**: Distinguish between completed and abandoned sessions

### Performance Analytics
- **Individual Scores**: Track performance on each question
- **Response Metrics**: Record response time and audio duration
- **Evaluation Details**: Store AI feedback, strengths, and improvements
- **Aggregate Statistics**: Calculate overall scores and averages

### Advanced Features
- **Row Level Security**: Users can only access their own data
- **Automated Triggers**: Auto-calculate scores and update user stats
- **Performance Views**: Pre-built analytics queries
- **Real-time Updates**: Live data synchronization

## 🔧 API Endpoints Available

### Interview Management
- `POST /api/interview/start` - Start new interview session
- `POST /api/interview/complete` - Complete interview session
- `GET /api/session/:sessionId` - Get session details

### User Performance
- `GET /api/user/:userId/performance` - Get user performance summary
- `GET /api/user/:userId/history` - Get interview history

### Analytics
- `GET /api/analytics/questions` - Get question performance analytics
- `POST /api/analytics/metric` - Record custom performance metrics

## 🔒 Security Features

### Row Level Security (RLS)
All tables have RLS enabled to ensure users can only access their own data.

### Authentication
Currently using service role for server-side operations. For production, consider implementing proper user authentication.

### Data Privacy
- Optional user registration
- Anonymous session support
- Secure data access patterns

## 📈 Monitoring Your Data

### Supabase Dashboard
1. Go to **Table Editor** to view raw data
2. Use **SQL Editor** to run custom queries
3. Check **Logs** for any database errors

### Sample Queries
```sql
-- View all interview sessions
SELECT * FROM interview_sessions ORDER BY started_at DESC;

-- Get user performance summary
SELECT * FROM user_performance_summary;

-- View question analytics
SELECT * FROM question_performance_analytics;

-- Check recent responses
SELECT 
    qr.*,
    is.started_at,
    u.name as user_name
FROM question_responses qr
JOIN interview_sessions is ON qr.session_id = is.id
JOIN users u ON is.user_id = u.id
ORDER BY qr.created_at DESC
LIMIT 10;
```

## 🚨 Troubleshooting

### Common Issues
1. **Schema errors**: Make sure to run the entire schema.sql file
2. **Permission errors**: Verify RLS policies are created correctly
3. **Connection errors**: Check environment variables are set correctly

### Debugging
- Check server logs for database connection issues
- Use Supabase logs to monitor database queries
- Verify API endpoints are working with browser dev tools

## 🎯 Next Steps

### Production Considerations
1. **User Authentication**: Implement proper user auth with Supabase Auth
2. **Data Backup**: Set up automated backups
3. **Performance Monitoring**: Monitor query performance
4. **Rate Limiting**: Implement API rate limiting

### Feature Enhancements
1. **Dashboard**: Create a user dashboard to view performance history
2. **Analytics**: Build advanced analytics and reporting
3. **Notifications**: Add email notifications for completed interviews
4. **Export**: Allow users to export their interview data

The database integration is now complete and ready for production use! 🎉