import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, TextField, IconButton, Typography, Paper, 
  Stack, Collapse, Fade, CircularProgress 
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';

/**
 * JayChatbot - A simplistic chatbot specialized for dashboard data.
 * It takes dashboardData as context to answer specific questions about user performance.
 */
const JayChatbot = ({ dashboardData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi, I'm Jay! Ask me anything about your dashboard data." }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/chatbot/jay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: userMsg,
          context: dashboardData // Passing sessions, analytics, etc.
        })
      });

      const data = await response.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.error || "Sorry, I'm having trouble connecting." }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: "Connection error. Please check if the backend is running." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ 
      position: 'fixed', 
      bottom: 16, 
      right: 16, 
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end'
    }}>
      <Fade in={isOpen} unmountOnExit>
        <Paper 
          elevation={6} 
          sx={{ 
            width: 320, 
            height: 400, 
            mb: 2, 
            borderRadius: 4, 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <SmartToyRoundedIcon />
              <Typography variant="subtitle1" fontWeight="bold">Jay</Typography>
            </Stack>
            <IconButton size="small" color="inherit" onClick={() => setIsOpen(false)}>
              <KeyboardArrowDownRoundedIcon />
            </IconButton>
          </Box>

          {/* Messages Area */}
          <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {messages.map((m, i) => (
              <Box key={i} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <Paper 
                  elevation={0} 
                  sx={{ 
                    p: 1.5, 
                    borderRadius: 3, 
                    bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
                    color: m.role === 'user' ? 'white' : 'text.primary',
                  }}
                >
                  <Typography variant="body2">{m.text}</Typography>
                </Paper>
              </Box>
            ))}
            {isLoading && (
              <Box sx={{ alignSelf: 'flex-start', ml: 1 }}>
                <CircularProgress size={16} color="inherit" sx={{ opacity: 0.5 }} />
              </Box>
            )}
          </Box>

          {/* Input Area */}
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <TextField
              fullWidth
              size="small"
              variant="outlined"
              placeholder="Ask Jay..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              autoComplete="off"
              InputProps={{
                endAdornment: (
                  <IconButton size="small" color="primary" onClick={handleSend} disabled={!input.trim()}>
                    <SendRoundedIcon fontSize="small" />
                  </IconButton>
                )
              }}
            />
          </Box>
        </Paper>
      </Fade>

      {/* Floating Toggle Button */}
      <IconButton 
        onClick={() => setIsOpen(!isOpen)}
        sx={{ 
          width: 56, 
          height: 56, 
          bgcolor: 'primary.main', 
          color: 'white', 
          boxShadow: 4,
          '&:hover': { bgcolor: 'primary.dark', transform: 'scale(1.05)' },
          transition: '0.2s'
        }}
      >
        {isOpen ? <KeyboardArrowDownRoundedIcon /> : <SmartToyRoundedIcon />}
      </IconButton>
    </Box>
  );
};

export default JayChatbot;
