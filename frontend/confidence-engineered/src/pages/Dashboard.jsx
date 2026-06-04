import React, { useState, useEffect } from 'react';
import {
  Box, Container, Grid, Paper, Typography, Avatar, Stack,
  Button, IconButton, Divider, Switch, FormControlLabel,
  Card, CardContent, CardActionArea, useTheme, Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import CodeIcon from '@mui/icons-material/Code';
import BrushIcon from '@mui/icons-material/Brush';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PersonIcon from '@mui/icons-material/Person';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';

import { useThemeContext } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import JayChatbot from '../components/JayChatbot';

const MotionPaper = motion.create(Paper);
const MotionCard = motion.create(Card);

export default function Dashboard() {
  const navigate = useNavigate();
  const { mode, toggleColorMode } = useThemeContext();
  const { token, logout, userId } = useAuth();
  const theme = useTheme();

  const [showSettings, setShowSettings] = useState(false);
  const [chartFocus, setChartFocus] = useState('All');
  const [avatarRole, setAvatarRole] = useState('generic');
  const [docs, setDocs] = useState(() => {
    const storedUserId = localStorage.getItem('authUserId');
    if (storedUserId) {
      const saved = localStorage.getItem(`docs_${storedUserId}`);
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { }
      }
    }
    return [];
  });
  const [sessionsData, setSessionsData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    if (userId) {
      localStorage.setItem(`docs_${userId}`, JSON.stringify(docs));
    }
  }, [docs, userId]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/analytics/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 401) {
          logout();
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        if (data && data.user) {
          setUserName(data.user.name.split(' ')[0]);
          setUserRole(data.user.role);
          setAvatarRole(data.user.avatarId);
        }
        if (data && data.sessions && data.sessions.length > 0) {
          const newSessions = data.sessions.map((s, i) => {
            const fb = s.feedback || {};
            const scores = ['clarity', 'relevance', 'structure', 'confidence', 'depth'].map(k => fb[k]?.score || 0);
            const overall = Math.floor(scores.reduce((a, b) => a + b, 0) / 5);
            return {
              id: s.session_id,
              date: s.created_at.substring(0, 10),
              score: overall,
              duration: s.duration || "N/A",
              job: (s.job_description || "").substring(0, 30) + '...'
            };
          }).reverse();

          const newAnalytics = data.sessions.map((s, i) => {
            const fb = s.feedback || {};
            return {
              session: `Session ${i + 1}`,
              clarity: fb.clarity?.score || 0,
              relevance: fb.relevance?.score || 0,
              structure: fb.structure?.score || 0,
              confidence: fb.confidence?.score || 0,
              depth: fb.depth?.score || 0,
            }
          });

          setSessionsData(newSessions);
          setAnalyticsData(newAnalytics);
        }
      })
      .catch(err => console.error("Failed to load analytics", err));
  }, [token]);

  const handleFileUpload = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      let content = "";
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/parse-document', {
          method: 'POST',
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: formData
        });
        const data = await res.json();
        if (data.text) content = data.text;
      } catch (err) {
        console.error("Failed to parse document", err);
      }

      // Default type based on keywords in filename, or just default to Job Requirements
      const lowerName = file.name.toLowerCase();
      let type = 'Job Requirements';
      if (lowerName.includes('resume') || lowerName.includes('cv') || lowerName.includes('background')) {
        type = 'Resume';
      }

      const newDoc = {
        id: Date.now(),
        title: file.name,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        type: type,
        content: content
      };
      setDocs(prev => [newDoc, ...prev]);
    }
  };

  const removeDoc = (id) => {
    setDocs(prev => prev.filter(d => d.id !== id));
  };

  const toggleDocType = (id) => {
    setDocs(prev => prev.map(d =>
      d.id === id ? { ...d, type: d.type === 'Resume' ? 'Job Requirements' : 'Resume' } : d
    ));
  };

  const handleAvatarChange = async (role) => {
    setAvatarRole(role);
    if (!token) return;
    try {
      await fetch('/api/user/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatar_id: role })
      });
    } catch (e) {
      console.error("Failed to update avatar", e);
    }
  };

  const getAvatarIcon = () => {
    switch (avatarRole) {
      case 'dev': return <CodeIcon fontSize="large" />;
      case 'design': return <BrushIcon fontSize="large" />;
      case 'manager': return <BusinessCenterIcon fontSize="large" />;
      default: return <PersonIcon fontSize="large" />;
    }
  };

  const getAvatarColor = () => {
    switch (avatarRole) {
      case 'dev': return theme.palette.primary.main;
      case 'design': return '#e91e63';
      case 'manager': return '#4caf50';
      default: return theme.palette.secondary.main;
    }
  };

  const chartColors = {
    clarity: '#8884d8',
    relevance: '#82ca9d',
    structure: '#ffc658',
    confidence: '#ff8042',
    depth: '#0088fe'
  };

  const dimensions = ['clarity', 'relevance', 'structure', 'confidence', 'depth'];
  const latestSession = analyticsData.length > 0 ? analyticsData[analyticsData.length - 1] : {};
  const sortedDims = dimensions.map(d => ({ name: d, score: latestSession[d] || 0 })).sort((a, b) => b.score - a.score);
  const strongest = sortedDims[0] || { name: 'None', score: 0 };
  const weakest = sortedDims[sortedDims.length - 1] || { name: 'None', score: 0 };

  const radarData = dimensions.map(d => ({
    subject: d.charAt(0).toUpperCase() + d.slice(1),
    A: latestSession[d] || 0,
    fullMark: 100,
  }));

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      pb: 8,
      background: mode === 'light'
        ? 'radial-gradient(circle at 15% 20%, rgba(15,76,129,0.08), transparent 40%), radial-gradient(circle at 85% 10%, rgba(31,122,140,0.08), transparent 45%), #eef3f8'
        : 'radial-gradient(circle at 15% 20%, rgba(15,76,129,0.15), transparent 40%), radial-gradient(circle at 85% 10%, rgba(31,122,140,0.15), transparent 45%), #121212',
    }}>
      <Box sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <Container maxWidth="xl">
          <Stack direction="row" justifyContent="space-between" alignItems="center" py={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar sx={{ bgcolor: getAvatarColor(), width: 56, height: 56 }}>
                {getAvatarIcon()}
              </Avatar>
              <Box>
                <Typography variant="h5" fontWeight="bold">Welcome back, {userName}!</Typography>
                <Typography variant="body2" color="text.secondary">{userRole}</Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={2}>
              <IconButton onClick={() => logout()} title="Logout" sx={{ color: 'text.secondary' }}>
                <LogoutRoundedIcon />
              </IconButton>
              <IconButton onClick={() => setShowSettings(!showSettings)} color={showSettings ? 'primary' : 'default'}>
                <SettingsRoundedIcon />
              </IconButton>
              <Button
                variant="contained"
                startIcon={<PlayArrowRoundedIcon />}
                onClick={() => navigate('/interview')}
                sx={{ borderRadius: 8, px: 3 }}
              >
                New Interview
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <motion.div variants={containerVariants} initial="hidden" animate="show">

          <AnimatePresence>
            {showSettings && (
              <MotionPaper
                initial={{ opacity: 0, height: 0, mb: 0 }}
                animate={{ opacity: 1, height: 'auto', mb: 24 }}
                exit={{ opacity: 0, height: 0, mb: 0 }}
                sx={{ p: 3, overflow: 'hidden', borderRadius: 3, border: 1, borderColor: 'divider' }}
              >
                <Typography variant="h6" gutterBottom>Dashboard Settings</Typography>
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormControlLabel
                      control={<Switch checked={mode === 'dark'} onChange={toggleColorMode} />}
                      label="Dark Mode"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="subtitle2" gutterBottom>Avatar Role</Typography>
                    <Stack direction="row" spacing={1}>
                      {['dev', 'design', 'manager', 'generic'].map(role => (
                        <Button
                          key={role}
                          variant={avatarRole === role ? 'contained' : 'outlined'}
                          size="small"
                          onClick={() => handleAvatarChange(role)}
                          sx={{ minWidth: 0, p: 1 }}
                        >
                          {role === 'dev' && <CodeIcon fontSize="small" />}
                          {role === 'design' && <BrushIcon fontSize="small" />}
                          {role === 'manager' && <BusinessCenterIcon fontSize="small" />}
                          {role === 'generic' && <PersonIcon fontSize="small" />}
                        </Button>
                      ))}
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="subtitle2" gutterBottom>Chart Focus</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {['All', 'Clarity', 'Relevance', 'Structure', 'Confidence', 'Depth'].map(f => (
                        <Button
                          key={f}
                          size="small"
                          variant={chartFocus === f ? 'contained' : 'outlined'}
                          onClick={() => setChartFocus(f)}
                          sx={{ borderRadius: 4, mb: 1 }}
                        >
                          {f}
                        </Button>
                      ))}
                    </Stack>
                  </Grid>
                </Grid>
              </MotionPaper>
            )}
          </AnimatePresence>

          <Grid container spacing={4}>
            {/* Analytics Section */}
            <Grid size={{ xs: 12, md: 8 }}>
              <MotionPaper variants={itemVariants} sx={{ p: 3, borderRadius: 4, height: '100%', border: 1, borderColor: 'divider', boxShadow: '0 8px 32px rgba(0,0,0,0.04)' }}>
                <Typography variant="h6" fontWeight="bold" mb={3}>Performance Trend</Typography>
                <Box sx={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer>
                    <AreaChart data={analyticsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        {dimensions.map(d => (
                          <linearGradient key={d} id={`color${d}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartColors[d]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={chartColors[d]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                      <XAxis dataKey="session" stroke={theme.palette.text.secondary} tick={{ fill: theme.palette.text.secondary }} />
                      <YAxis domain={[0, 100]} stroke={theme.palette.text.secondary} tick={{ fill: theme.palette.text.secondary }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}
                      />
                      {dimensions.map(d => (
                        (chartFocus === 'All' || chartFocus.toLowerCase() === d) && (
                          <Area
                            key={d}
                            type="monotone"
                            dataKey={d}
                            stroke={chartColors[d]}
                            fillOpacity={1}
                            fill={`url(#color${d})`}
                            strokeWidth={3}
                            animationDuration={1500}
                          />
                        )
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </MotionPaper>
            </Grid>

            {/* Radar / Strengths Section */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={4} height="100%">
                <MotionPaper variants={itemVariants} sx={{ p: 3, borderRadius: 4, flex: 1, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" fontWeight="bold">Skill Radar</Typography>
                  <Box sx={{ flex: 1, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                        <PolarGrid stroke={theme.palette.divider} />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Score" dataKey="A" stroke={theme.palette.primary.main} fill={theme.palette.primary.main} fillOpacity={0.4} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </Box>
                  <Stack direction="row" spacing={2} mt={2}>
                    <Box flex={1} bgcolor="success.main" color="success.contrastText" p={1.5} borderRadius={2}>
                      <Typography variant="caption" display="block">Strongest</Typography>
                      <Typography variant="subtitle2" fontWeight="bold" textTransform="capitalize">{strongest.name}</Typography>
                    </Box>
                    <Box flex={1} bgcolor="warning.main" color="warning.contrastText" p={1.5} borderRadius={2}>
                      <Typography variant="caption" display="block">Needs Work</Typography>
                      <Typography variant="subtitle2" fontWeight="bold" textTransform="capitalize">{weakest.name}</Typography>
                    </Box>
                  </Stack>
                </MotionPaper>
              </Stack>
            </Grid>

            {/* Bottom Row: Sessions and Docs */}
            <Grid size={{ xs: 12, md: 6 }}>
              <MotionPaper variants={itemVariants} sx={{ p: 3, borderRadius: 4, height: '100%', border: 1, borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" fontWeight="bold">Recent Sessions</Typography>
                  <IconButton size="small"><HistoryRoundedIcon /></IconButton>
                </Stack>
                <Stack spacing={2}>
                  {sessionsData.map((session, i) => (
                    <Box key={session.id}>
                      {i > 0 && <Divider sx={{ my: 1.5 }} />}
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">{session.job}</Typography>
                          <Typography variant="body2" color="text.secondary">{session.date} • {session.duration}</Typography>
                        </Box>
                        <Box textAlign="right">
                          <Typography variant="h6" color="primary.main" fontWeight="bold">{session.score}</Typography>
                          <Typography variant="caption" color="text.secondary">Overall</Typography>
                        </Box>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </MotionPaper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <MotionPaper variants={itemVariants} sx={{ p: 3, borderRadius: 4, height: '100%', border: 1, borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" fontWeight="bold">Uploaded Documents</Typography>
                  <Button variant="outlined" component="label" size="small" startIcon={<DescriptionRoundedIcon />}>
                    Upload
                    <input type="file" hidden onChange={handleFileUpload} />
                  </Button>
                </Stack>
                <Grid container spacing={2}>
                  {docs.map((doc) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={doc.id}>
                      <Card variant="outlined" sx={{ borderRadius: 3, height: '100%', transition: '0.2s', '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' } }}>
                        <Box sx={{ p: 2, height: '100%' }}>
                          <Stack spacing={1.5}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Stack direction="row" spacing={1} alignItems="center">
                                <DescriptionRoundedIcon color={doc.type === 'Resume' ? 'secondary' : 'primary'} />
                                <Chip
                                  label={doc.type}
                                  size="small"
                                  color={doc.type === 'Resume' ? 'secondary' : 'primary'}
                                  variant="outlined"
                                  onClick={() => toggleDocType(doc.id)}
                                  sx={{ cursor: 'pointer', fontWeight: 'bold' }}
                                />
                              </Stack>
                              <IconButton 
                                size="small" 
                                color="error" 
                                onClick={() => removeDoc(doc.id)}
                                sx={{ mt: -0.5, mr: -0.5, opacity: 0.7, '&:hover': { opacity: 1 } }}
                              >
                                <DeleteOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                            <Box>
                              <Typography variant="subtitle2" noWrap title={doc.title}>{doc.title}</Typography>
                              <Typography variant="caption" color="text.secondary" display="block">
                                {doc.content ? 'Content loaded' : 'Empty - Re-upload'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">{doc.date}</Typography>
                            </Box>
                          </Stack>
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </MotionPaper>
            </Grid>

          </Grid>
        </motion.div>
      </Container>
      <JayChatbot 
        dashboardData={{ 
          sessions: sessionsData, 
          analytics: analyticsData, 
          user: { name: userName, role: userRole } 
        }} 
      />
    </Box>
  );
}
